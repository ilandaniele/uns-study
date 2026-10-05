import { pushSubscriptionSchema } from "@sala/contracts";
import { apiFetch, apiPost } from "./api";

/**
 * Converts a URL-safe base64 VAPID public key (as returned by the API) into the raw `Uint8Array`
 * `PushManager.subscribe`'s `applicationServerKey` option needs. Pure — no browser APIs — so it's
 * unit-testable without a DOM.
 */
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Whether the current device is an iPhone/iPad — Safari only supports Web Push for a PWA
 *  installed to the home screen (iOS 16.4+), never in a regular browser tab. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Whether the page is currently running as an installed PWA (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export type PushSupportState = "unsupported" | "ios-needs-install" | "denied" | "available";

/** Coarse support/eligibility check the settings UI uses to decide what to show, before the user
 *  even taps "Activar notificaciones". */
export function getPushSupportState(): PushSupportState {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (isIos() && !isStandalone()) return "ios-needs-install";
  if (Notification.permission === "denied") return "denied";
  return "available";
}

/**
 * Requests notification permission (if not already granted), subscribes via the browser's
 * `PushManager` using the API's VAPID public key, and registers the subscription server-side.
 * Returns `true` on success, `false` if permission was denied or push isn't supported.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (getPushSupportState() !== "available" && Notification.permission !== "granted") return false;

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await apiFetch<{ publicKey: string }>("/api/v1/notifications/vapid-public-key");
  if (!publicKey) return false;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await apiPost("/api/v1/notifications/push-subscriptions", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  }, pushSubscriptionSchema);
  return true;
}

/** Unsubscribes this device from push and tells the API to forget it. Safe to call even if the
 *  device was never subscribed. */
export async function disablePushNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  try {
    await apiFetch("/api/v1/notifications/push-subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
  } catch {
    // best-effort — the device-side unsubscribe above already happened either way
  }
}
