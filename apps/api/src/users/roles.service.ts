import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";

export type Role = "ADMIN" | "MODERATOR";

@Injectable()
export class RolesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async rolesFor(userId: string): Promise<Role[]> {
    const rows = await this.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    return rows.map((r) => r.role as Role);
  }

  async hasRole(userId: string, roles: Role[]): Promise<boolean> {
    const mine = await this.rolesFor(userId);
    return mine.some((r) => roles.includes(r));
  }

  /** If `email` is in the `ADMIN_EMAILS` env list (case-insensitive), upserts the ADMIN role for `userId`. */
  async ensureAdminFromEnv(userId: string, email: string): Promise<void> {
    if (!env.adminEmails.includes(email.trim().toLowerCase())) return;
    await this.db.insert(schema.userRoles).values({ userId, role: "ADMIN" }).onConflictDoNothing();
  }
}
