// Service worker for push notifications only. Registered only in production (see
// ServiceWorkerRegistration.tsx).
//
// It deliberately has NO `fetch` handler: earlier versions intercepted page loads and build assets,
// and a stale worker could leave the app blank or stuck on "Cargando sala…" after a deploy. Without
// a fetch handler the browser loads everything straight from the network (and its own HTTP cache).
// On activation it deletes every cache earlier versions created and reloads open tabs once, so
// visitors still controlled by an old worker recover without clearing site data.
const SW_VERSION = "v6";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
      // Tabs that were loaded (or got stuck) under an old worker: reload them once under this one.
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
    })(),
  );
});

void SW_VERSION;

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
