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

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribePushSchema = z.object({
  endpoint: z.string().url(),
});

// ---- Realtime events ----

/** In-app alert when one or more seats free up, for subscribed users who currently have no
 *  active check-in in the room — sent to their private `user:{userId}` channel. */
export interface SeatFreedAlertEvent {
  seatIds: string[];
  freeCount: number;
}

/** Broadcast to everyone viewing the room when an ADMIN/MODERATOR creates a fresh check-in there. */
export interface RoomAdminPresentEvent {
  since: string;
}
