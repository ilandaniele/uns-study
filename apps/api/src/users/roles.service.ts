import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";

export type Role = "ADMIN" | "MODERATOR";

@Injectable()
export class RolesService {
  /** Users whose admin role was already upserted by this process, so `/me` stops writing on every call. */
  private readonly ensuredAdmins = new Set<string>();

  constructor(@Inject(DB) private readonly db: Db) {}

  async rolesFor(userId: string): Promise<Role[]> {
    const rows = await this.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    return rows.map((r) => r.role as Role);
  }

  async hasRole(userId: string, roles: Role[]): Promise<boolean> {
    const mine = await this.rolesFor(userId);
    return mine.some((r) => roles.includes(r));
  }

  /** Which of `userIds` hold the ADMIN role — one query for a whole list (badges on avatars). */
  async adminIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .select({ userId: schema.userRoles.userId })
      .from(schema.userRoles)
      .where(and(inArray(schema.userRoles.userId, [...new Set(userIds)]), eq(schema.userRoles.role, "ADMIN")));
    return new Set(rows.map((r) => r.userId));
  }

  /** If `email` is in the `ADMIN_EMAILS` env list (case-insensitive) and verified, upserts the ADMIN role for `userId`. */
  async ensureAdminFromEnv(userId: string, email: string, emailVerified: boolean): Promise<void> {
    if (this.ensuredAdmins.has(userId)) return;
    if (emailVerified !== true) return; // an unverified signup must not claim an admin address
    if (!env.adminEmails.includes(email.trim().toLowerCase())) return;
    await this.db.insert(schema.userRoles).values({ userId, role: "ADMIN" }).onConflictDoNothing();
    this.ensuredAdmins.add(userId);
  }
}
