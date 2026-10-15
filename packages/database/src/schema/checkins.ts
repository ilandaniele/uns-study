import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const checkInStatusEnum = { enumValues: ["ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"] as const };

export const checkIns = sqliteTable(
  "check_ins",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: text("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    status: text("status", { enum: checkInStatusEnum.enumValues }).notNull().default("ACTIVE"),
    showIdentity: integer("show_identity", { mode: "boolean" }).notNull().default(false),
    presenceVerified: integer("presence_verified", { mode: "boolean" }).notNull().default(false),
    locationAccuracyM: real("location_accuracy_m"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    // Photo verification (see docs/SEAT_PHOTO_VERIFIER.md). `verifiedAt` is set once the seat
    // verifier model agrees with the claimed seat; protection lasts VERIFIED_PROTECTION_MINUTES
    // from that time (see `isCheckInVerified`). The photo itself is never stored — only its hash,
    // to block reusing the same image to verify any other check-in (own or someone else's) — see
    // the `uq_check_ins_verification_photo_sha256` partial unique index below.
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    verificationConfidence: real("verification_confidence"),
    verifierModel: text("verifier_model"),
    verificationPhotoSha256: text("verification_photo_sha256"),
    // Set once the "expires in 10 min" reminder has been claimed; reset to null when extended.
    expiryReminderSentAt: integer("expiry_reminder_sent_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    // One active self check-in per user / per seat.
    uniqueIndex("uq_checkin_active_user")
      .on(table.userId)
      .where(sql`status = 'ACTIVE'`),
    uniqueIndex("uq_checkin_active_seat")
      .on(table.seatId)
      .where(sql`status = 'ACTIVE'`),
    index("idx_check_ins_seat_status").on(table.seatId, table.status),
    index("idx_check_ins_room_status").on(table.roomId, table.status),
    index("idx_check_ins_room_created").on(table.roomId, table.createdAt),
    index("idx_check_ins_active_expires")
      .on(table.expiresAt)
      .where(sql`status = 'ACTIVE'`),
    index("idx_check_ins_user_created").on(table.userId, table.createdAt),
    // A photo's hash can verify at most one check-in ever — partial so unverified rows (most of
    // them, null hash) never collide with each other.
    uniqueIndex("uq_check_ins_verification_photo_sha256")
      .on(table.verificationPhotoSha256)
      .where(sql`verification_photo_sha256 is not null`),
  ],
);
