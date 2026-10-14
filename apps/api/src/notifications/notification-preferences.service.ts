import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { NotificationPreferencesDto } from "@sala/contracts";

type PreferencesRow = typeof schema.notificationPreferences.$inferSelect;
export type NotificationPreferencesPatch = Partial<Pick<PreferencesRow, "seatFreed" | "adminPresent" | "checkinExpiry" | "marketingEmails">>;

/** Per-user opt-in switches, the first two `false` until the user turns them on (same "everything private
 *  by default" convention as `user_privacy_settings`). */
export class NotificationPreferencesService {
  constructor(private readonly db: Db) {}

  private async ensure(userId: string): Promise<PreferencesRow> {
    await this.db.insert(schema.notificationPreferences).values({ userId }).onConflictDoNothing();
    const [row] = await this.db.select().from(schema.notificationPreferences).where(eq(schema.notificationPreferences.userId, userId)).limit(1);
    if (!row) throw new Error("notification_preferences row missing after upsert");
    return row;
  }

  async get(userId: string): Promise<NotificationPreferencesDto> {
    return toDto(await this.ensure(userId));
  }

  async update(userId: string, patch: NotificationPreferencesPatch): Promise<NotificationPreferencesDto> {
    await this.ensure(userId);
    const [row] = await this.db
      .update(schema.notificationPreferences)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.notificationPreferences.userId, userId))
      .returning();
    if (!row) throw new Error("notification_preferences row vanished during update");
    return toDto(row);
  }
}

function toDto(row: PreferencesRow): NotificationPreferencesDto {
  return { seatFreed: row.seatFreed, adminPresent: row.adminPresent, checkinExpiry: row.checkinExpiry, marketingEmails: row.marketingEmails };
}
