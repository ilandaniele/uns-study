/** Local notifications for phase changes. No server involved: the open tab raises them itself. */

export type NotifyPermission = NotificationPermission | "unsupported";

export function notifyPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notifyPermission();
  }
}

/**
 * Prefers the service worker (required on Android Chrome, where `new Notification` throws) and
 * falls back to the page API. Clicking it focuses the app on /foco (see `notificationclick` in sw.js).
 */
export async function showFocusNotification(title: string, body: string): Promise<void> {
  if (notifyPermission() !== "granted") return;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    tag: "pomodoro",
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    vibrate: [180, 80, 180],
    data: { url: "/foco" },
  };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fall through to the page API.
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Unsupported in this context (e.g. Android without a worker); the chime still plays.
  }
}
