// Service worker for push notifications only. Registered only in production (see
// ServiceWorkerRegistration.tsx).
//
// It deliberately has NO `fetch` handler: earlier versions intercepted page loads and build assets,
// and a stale worker could leave the app blank or stuck on "Cargando sala…" after a deploy. Without
// a fetch handler the browser loads everything straight from the network (and its own HTTP cache).
// On activation it deletes every cache earlier versions created, so visitors still controlled by an
// old worker recover on their next navigation without clearing site data.
const SW_VERSION = "v10";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
      // No forced reload of open tabs here: on a first visit that reload raced the page while it
      // was hydrating. Without a fetch handler, the next navigation is already network-only.
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

async function hasFocusedWindow() {
  try {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    return windows.some((client) => client.visibilityState === "visible" && client.focused);
  } catch {
    return false;
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
  if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.now()) return;
  event.waitUntil(
    (async () => {
      // A message already arrives in-app over the socket: don't also buzz while the user is looking at the app.
      if (typeof tag === "string" && tag.startsWith("dm-") && (await hasFocusedWindow())) return;
      try {
        await self.navigator.setAppBadge?.();
      } catch {
        // Badging is optional.
      }
      await self.registration.showNotification(title, {
        body,
        tag, // same tag replaces any earlier notification of the same kind instead of stacking
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { url: toSameOriginPath(url) },
      });
    })(),
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
          // `navigate` rejects on a tab this worker doesn't control (e.g. opened before it
          // activated); focusing it and opening the target in a new tab is the fallback.
          try {
            if (client.navigate) await client.navigate(targetUrl);
            return client.focus();
          } catch {
            return self.clients.openWindow(targetUrl);
          }
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
