import { customType, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

/** Raw binary column (SQLite blob). better-sqlite3 hands back a `Buffer`, the DO SqlStorage driver an
 *  `ArrayBuffer` — normalize both to `Buffer` on read so callers never have to care which driver ran. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array | ArrayBuffer }>({
  dataType() {
    return "blob";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as ArrayBuffer);
  },
});

/** Uploaded profile photo bytes — never served directly to clients; `GET /avatars/:userId` streams
 *  them gated by `user_privacy_settings.show_avatar`. `user_profiles.avatar_url` points back here. */
export const userAvatars = sqliteTable("user_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
