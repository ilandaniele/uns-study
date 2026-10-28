import { and, eq, inArray, or } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { ApiErrors } from "../common/api-error.js";
import { displayName, visibleAvatarUrl } from "../users/display-name.js";
import { AliasService } from "../users/alias.service.js";
import type { RealtimeHub } from "../realtime/realtime-hub.js";

/** Hard cap on the unpaginated blocked-users list. */
const MAX_LIST_ROWS = 200;

export interface BlockedUserDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

/** Blocking is one-directional per row; several helpers combine both directions for interaction checks. */
export class BlocksService {
  constructor(
    private readonly db: Db,
    private readonly aliases: AliasService,
    private readonly hub: RealtimeHub | null = null,
  ) {}

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw ApiErrors.validation("No podés bloquearte a vos mismo.");
    this.db.transaction(() => {
      const target = this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, blockedId)).get();
      if (!target) throw ApiErrors.notFound("Usuario no encontrado.");
      this.db.insert(schema.userBlocks).values({ blockerId, blockedId }).onConflictDoNothing().run();
      this.db.delete(schema.friendships).where(or(
        and(eq(schema.friendships.lowerUserId, blockerId), eq(schema.friendships.upperUserId, blockedId)),
        and(eq(schema.friendships.lowerUserId, blockedId), eq(schema.friendships.upperUserId, blockerId)),
      )).run();
    });
    this.hub?.publishToUser(blockerId, "friends:changed", {});
    this.hub?.publishToUser(blockedId, "friends:changed", {});
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
      .where(eq(schema.userBlocks.blockerId, userId))
      .limit(MAX_LIST_ROWS);

    if (rows.length === 0) return [];
    const blockedIds = rows.map((r) => r.blockedId);
    const privacyRows = inChunks(blockedIds, (part) =>
      this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, part)).all(),
    );
    const privacyByUser = new Map(privacyRows.map((p) => [p.userId, p]));
    const profiles = rows.map((r) => r.profile).filter((p): p is NonNullable<typeof p> => p !== null);
    const aliasByUser = await this.aliases.ensureAliasesForProfiles(profiles);

    return rows.map((r) => {
      const profile = r.profile ? { ...r.profile, alias: aliasByUser.get(r.blockedId) ?? r.profile.alias } : null;
      return {
        userId: r.blockedId,
        displayName: displayName(profile, privacyByUser.get(r.blockedId) ?? null, r.name),
        avatarUrl: visibleAvatarUrl(profile, privacyByUser.get(r.blockedId) ?? null),
        blockedAt: r.createdAt.toISOString(),
      };
    });
  }
}
