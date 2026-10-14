import { and, eq, inArray } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { env } from "../env.js";

export type Role = "ADMIN" | "MODERATOR";

export class RolesService {
  /** Users whose admin role was already upserted by this process, so `/me` stops writing on every call. */
  private readonly ensuredAdmins = new Set<string>();

  constructor(private readonly db: Db) {}

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
    const rows = inChunks([...new Set(userIds)], (part) =>
      this.db
        .select({ userId: schema.userRoles.userId })
        .from(schema.userRoles)
        .where(and(inArray(schema.userRoles.userId, part), eq(schema.userRoles.role, "ADMIN")))
        .all(),
    );
    return new Set(rows.map((r) => r.userId));
  }

  /** True only for the verified app owner (`OWNER_EMAIL`), the sole account allowed to grant/revoke ADMIN. */
  async isOwner(userId: string): Promise<boolean> {
    if (!env.ownerEmail) return false;
    const [u] = await this.db.select({ email: schema.user.email, emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    return Boolean(u && u.emailVerified === true && u.email.trim().toLowerCase() === env.ownerEmail);
  }

  async grantRole(userId: string, role: Role): Promise<void> {
    await this.db.insert(schema.userRoles).values({ userId, role }).onConflictDoNothing();
  }

  async revokeRole(userId: string, role: Role): Promise<void> {
    await this.db.delete(schema.userRoles).where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.role, role)));
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
