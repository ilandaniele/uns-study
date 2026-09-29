import { z } from "zod";

// ---- Preferences ----

export interface NotificationPreferencesDto {
  seatFreed: boolean;
  adminPresent: boolean;
}

export const updateNotificationPreferencesSchema = z
  .object({
    seatFreed: z.boolean(),
    adminPresent: z.boolean(),
  })
  .partial();

// ---- Web Push ----

export interface VapidPublicKeyDto {
  publicKey: string;
}

/**
 * Decodes a URL-safe base64 string's byte length, used to validate `p256dh`/`auth` key sizes
 * below. `atob`/`btoa` are global in both Node 18+ and every browser, so this needs no extra
 * import and works whether this schema runs on the API or (in principle) the web client.
 */
function base64UrlByteLength(value: string): number | null {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    return atob(padded).length;
  } catch {
    return null;
  }
}

export const pushSubscriptionSchema = z.object({
  // Real push service endpoints are short URLs; 2048 is a generous ceiling that just keeps a
  // malformed/hostile payload from being stored or, later, POSTed to by `PushService`.
  endpoint: z.string().url().max(2048),
  keys: z.object({
    // A P-256 uncompressed public key is always exactly 65 raw bytes.
    p256dh: z.string().refine((v) => base64UrlByteLength(v) === 65, "p256dh inválido"),
    // The Web Push auth secret is always exactly 16 raw bytes.
    auth: z.string().refine((v) => base64UrlByteLength(v) === 16, "auth inválido"),
  }),
});

export const unsubscribePushSchema = z.object({
  endpoint: z.string().url().max(2048),
});

// ---- Realtime events ----

/** In-app alert when one or more seats free up, for subscribed users who currently have no
 *  active check-in in the room — sent to their private `user:{userId}` channel. */
export interface SeatFreedAlertEvent {
  seatIds: string[];
  freeCount: number;
}

/** Broadcast to everyone viewing the room when an ADMIN/MODERATOR creates a fresh check-in there.
 *  Carries no timestamp/identity — the emit itself is already delayed by a random 2-5 minutes (see
 *  `NotificationService.scheduleAdminPresent`) specifically so it can't be correlated back to any
 *  particular check-in or seat. */
export type RoomAdminPresentEvent = Record<string, never>;
