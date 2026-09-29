// Minimal PWA offline shell. Registered only in production (see ServiceWorkerRegistration.tsx).
// Never caches `/api` (own-origin API calls go through NEXT_PUBLIC_API_URL on a different origin
// anyway) or any cross-origin request — PostgreSQL/the API stay the single source of truth.
// Bump CACHE_VERSION whenever this file (or what it caches) changes — `activate` below deletes any
// cache under the old name, so a stale shell/build asset can never survive a deploy.
const CACHE_VERSION = "v2";
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

  if (url.pathname.startsWith("/_next/static")) {
    // Cache-first for hashed build assets: they're immutable per build.
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then(
          (cached) =>
            cached ??
            fetch(event.request).then((res) => {
              if (res.ok) cache.put(event.request, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
