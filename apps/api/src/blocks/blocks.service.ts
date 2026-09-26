import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, or } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { displayName, visibleAvatarUrl } from "../users/display-name.js";

export interface BlockedUserDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

/** Blocking is one-directional per row; several helpers combine both directions for interaction checks. */
@Injectable()
export class BlocksService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw ApiErrors.validation("No podés bloquearte a vos mismo.");
    await this.db.insert(schema.userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.db
      .delete(schema.userBlocks)
      .where(and(eq(schema.userBlocks.blockerId, blockerId), eq(schema.userBlocks.blockedId, blockedId)));
  }

  /** Ids the given user has blocked (viewer -> author direction), used to filter feeds. */
  async blockedByMe(userId: string): Promise<string[]> {
    const rows = await this.db.select().from(schema.userBlocks).where(eq(schema.userBlocks.blockerId, userId));
    return rows.map((r) => r.blockedId);
  }

  /** True if either user has blocked the other. */
  async isBlockedEitherDirection(userA: string, userB: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(schema.userBlocks)
      .where(
        or(
          and(eq(schema.userBlocks.blockerId, userA), eq(schema.userBlocks.blockedId, userB)),
          and(eq(schema.userBlocks.blockerId, userB), eq(schema.userBlocks.blockedId, userA)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async listBlocks(userId: string): Promise<BlockedUserDto[]> {
    const rows = await this.db
      .select({
        blockedId: schema.userBlocks.blockedId,
        createdAt: schema.userBlocks.createdAt,
        name: schema.user.name,
        profile: schema.userProfiles,
      })
      .from(schema.userBlocks)
      .innerJoin(schema.user, eq(schema.user.id, schema.userBlocks.blockedId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.userBlocks.blockedId))
      .where(eq(schema.userBlocks.blockerId, userId));

    if (rows.length === 0) return [];
    const privacyRows = await this.db
      .select()
      .from(schema.userPrivacySettings)
      .where(inArray(schema.userPrivacySettings.userId, rows.map((r) => r.blockedId)));
    const privacyByUser = new Map(privacyRows.map((p) => [p.userId, p]));

    return rows.map((r) => ({
      userId: r.blockedId,
      displayName: displayName(r.profile, privacyByUser.get(r.blockedId) ?? null, r.name),
      avatarUrl: visibleAvatarUrl(r.profile, privacyByUser.get(r.blockedId) ?? null),
      blockedAt: r.createdAt.toISOString(),
    }));
  }
}
