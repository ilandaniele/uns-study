import { sql } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { rooms, seats } from "./rooms.js";
import { user } from "./auth.js";

export const checkInStatusEnum = pgEnum("check_in_status", ["ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"]);

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    status: checkInStatusEnum("status").notNull().default("ACTIVE"),
    showIdentity: boolean("show_identity").notNull().default(false),
    presenceVerified: boolean("presence_verified").notNull().default(false),
    locationAccuracyM: real("location_accuracy_m"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // Photo verification (see docs/SEAT_PHOTO_VERIFIER.md). `verifiedAt` is set once the seat
    // verifier model agrees with the claimed seat; protection lasts VERIFIED_PROTECTION_MINUTES
    // from that time (see `isCheckInVerified`). The photo itself is never stored — only its hash,
    // to block reusing the same image to verify any other check-in (own or someone else's) — see
    // the `uq_check_ins_verification_photo_sha256` partial unique index below.
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationConfidence: real("verification_confidence"),
    verifierModel: text("verifier_model"),
    verificationPhotoSha256: text("verification_photo_sha256"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One active self check-in per user / per seat.
    uniqueIndex("uq_checkin_active_user")
      .on(table.userId)
      .where(sql`status = 'ACTIVE'`),
    uniqueIndex("uq_checkin_active_seat")
      .on(table.seatId)
      .where(sql`status = 'ACTIVE'`),
    index("idx_check_ins_user_status").on(table.userId, table.status),
    index("idx_check_ins_seat_status").on(table.seatId, table.status),
    index("idx_check_ins_room_status").on(table.roomId, table.status),
    index("idx_check_ins_expires_at").on(table.expiresAt),
    // A photo's hash can verify at most one check-in ever — partial so unverified rows (most of
    // them, null hash) never collide with each other.
    uniqueIndex("uq_check_ins_verification_photo_sha256")
      .on(table.verificationPhotoSha256)
      .where(sql`verification_photo_sha256 is not null`),
  ],
);
