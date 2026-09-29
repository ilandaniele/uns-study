// Minimal PWA offline shell. Registered only in production (see ServiceWorkerRegistration.tsx).
// Never caches `/api` (own-origin API calls go through NEXT_PUBLIC_API_URL on a different origin
// anyway) or any cross-origin request — PostgreSQL/the API stay the single source of truth.
// Bump CACHE_VERSION whenever this file (or what it caches) changes — `activate` below deletes any
// cache under the old name, so a stale shell/build asset can never survive a deploy.
const CACHE_VERSION = "v5";
const CACHE_NAME = `uns-study-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) return; // never touch cross-origin requests (API, sockets, ads, GA, etc.)
  if (url.pathname.startsWith("/api")) return; // never cache API responses

  if (event.request.mode === "navigate") {
    // Network-first for page navigations, falling back to the cached offline shell.
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error())),
    );
    return;
  }

  // Build assets (/_next/static) are NOT cached here anymore: some chunk file names stay the same
  // across builds while their content changes, so a cache-first copy could mix an old chunk with a
  // new page and leave the app stuck on "Cargando sala…". The browser's HTTP cache already
  // handles these (Vercel serves them as immutable), which is all we need.
});

// Only ever navigate to a same-origin, relative path — a push payload or a notification's stored
// `data.url` must never be trusted to point somewhere off-origin (e.g. if a payload were ever
// malformed or tampered with in transit).
function toSameOriginPath(rawUrl) {
  try {
    const u = new URL(rawUrl, self.location.origin);
    if (u.origin !== self.location.origin) return "/";
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

// Web Push (see apps/api/src/notifications). Payload is always our own JSON
// `{ title, body, url, tag }` — the API never sends anything else through this channel.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const { title, body, url, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag, // same tag replaces any earlier notification of the same kind instead of stacking
      icon: "/icons/icon-192.png",
      data: { url: toSameOriginPath(url) },
    }),
  );
});

// Focuses an already-open tab on the notification's `url` if one exists, otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = toSameOriginPath(event.notification.data?.url ?? "/");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if (client.navigate) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
