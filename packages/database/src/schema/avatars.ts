import { customType, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/** Raw binary column. `pg` (node-postgres) hands back a `Buffer` for `bytea`; PGlite hands back a
 *  `Uint8Array` — normalize both to `Buffer` on read so callers never have to care which driver ran. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  },
});

/** Uploaded profile photo bytes — never served directly to clients; `GET /avatars/:userId` streams
 *  them gated by `user_privacy_settings.show_avatar`. `user_profiles.avatar_url` points back here. */
export const userAvatars = pgTable("user_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
