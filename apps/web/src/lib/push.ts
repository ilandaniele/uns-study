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

export type PushEnableFailure =
  | "unsupported"
  | "permission-denied"
  | "permission-dismissed"
  | "no-service-worker"
  | "push-service"
  | "server";

export type PushEnableResult = { ok: true } | { ok: false; reason: PushEnableFailure; detail?: string };

const SERVICE_WORKER_TIMEOUT_MS = 10_000;

/** Whether two VAPID keys (raw bytes) are the same key. */
export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  if (bytes.length !== b.length) return false;
  return bytes.every((byte, i) => byte === b[i]);
}

/** The service worker registration, registering `/sw.js` if the page never did (the regular
 *  registration only runs after hydration and only in production). Gives up after a timeout
 *  instead of hanging on `serviceWorker.ready` forever. */
async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing) await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  } catch {
    return null;
  }
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SERVICE_WORKER_TIMEOUT_MS));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name || error.message : String(error);
}

/**
 * Requests notification permission (if not already granted), subscribes via the browser's
 * `PushManager` using the API's VAPID public key, and registers the subscription server-side.
 * Never throws: every failure comes back as a reason the UI can explain.
 */
export async function enablePushNotificationsDetailed(): Promise<PushEnableResult> {
  const support = getPushSupportState();
  if (support === "unsupported" || support === "ios-needs-install") return { ok: false, reason: "unsupported" };

  // Ask first, while the click's user activation is still fresh.
  let permission: NotificationPermission;
  try {
    permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  } catch (error) {
    return { ok: false, reason: "permission-dismissed", detail: errorName(error) };
  }
  if (permission === "denied") return { ok: false, reason: "permission-denied" };
  if (permission !== "granted") return { ok: false, reason: "permission-dismissed" };

  const registration = await serviceWorkerRegistration();
  if (!registration) return { ok: false, reason: "no-service-worker" };

  let publicKey: string;
  try {
    ({ publicKey } = await apiFetch<{ publicKey: string }>("/api/v1/notifications/vapid-public-key"));
  } catch (error) {
    return { ok: false, reason: "server", detail: errorName(error) };
  }
  if (!publicKey) return { ok: false, reason: "server", detail: "no-vapid-key" };
  const applicationServerKey = base64UrlToUint8Array(publicKey);

  let subscription: PushSubscription;
  try {
    let existing = await registration.pushManager.getSubscription();
    // A subscription made with an older VAPID key can't receive our pushes; replace it.
    if (existing && !sameKey(existing.options?.applicationServerKey, applicationServerKey)) {
      await existing.unsubscribe().catch(() => false);
      existing = null;
    }
    subscription =
      existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource }));
  } catch (error) {
    return { ok: false, reason: "push-service", detail: errorName(error) };
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, reason: "push-service", detail: "no-keys" };

  try {
    await apiPost(
      "/api/v1/notifications/push-subscriptions",
      { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
      pushSubscriptionSchema,
    );
  } catch (error) {
    return { ok: false, reason: "server", detail: errorName(error) };
  }
  return { ok: true };
}

/** Boolean form for callers that only need success/failure. */
export async function enablePushNotifications(): Promise<boolean> {
  return (await enablePushNotificationsDetailed()).ok;
}

/** User-facing Spanish explanation for a failed activation, with what to do next. */
export function pushFailureMessage(result: Exclude<PushEnableResult, { ok: true }>): string {
  const message = baseFailureMessage(result);
  // An app installed from the old address opens saladeestudio.com.ar as an outside page, where
  // Android can't grant notifications; Chrome itself can also have notifications off in Android.
  if (isAndroid() && (result.reason === "permission-dismissed" || result.reason === "push-service")) {
    return `${message} En Android: si instalaste la app antes del cambio de dirección, desinstalala y volvé a instalarla desde saladeestudio.com.ar en Chrome. Revisá también que Chrome tenga las notificaciones permitidas en Ajustes › Apps › Chrome › Notificaciones.`;
  }
  return message;
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

function baseFailureMessage(result: Exclude<PushEnableResult, { ok: true }>): string {
  const code = result.detail ? ` (código: ${result.detail})` : "";
  switch (result.reason) {
    case "unsupported":
      return "Este navegador no soporta notificaciones. Abrí saladeestudio.com.ar en Chrome o instalá la app.";
    case "permission-denied":
      return "Las notificaciones están bloqueadas para este sitio. Tocá el candado al lado de la dirección › Permisos › Notificaciones › Permitir, y probá de nuevo.";
    case "permission-dismissed":
      return `No se dio el permiso. Si no apareció el cartel, tocá el candado al lado de la dirección › Permisos › Notificaciones › Permitir, y probá de nuevo.${code}`;
    case "no-service-worker":
      return "La app no terminó de cargar. Recargá la página y probá de nuevo.";
    case "push-service":
      return `Tu navegador no pudo conectarse al servicio de notificaciones. Abrí saladeestudio.com.ar directo en Chrome (no desde otra app como WhatsApp o Instagram) o instalá la app, y probá de nuevo.${code}`;
    case "server":
      return `No pudimos guardar el aviso en el servidor. Probá de nuevo en un rato.${code}`;
  }
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
