import { eq, inArray } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { NAME_COLORS, PROFILE_FRAMES, type MyCosmeticsDto, type NameColorId, type ProfileFlairDto, type ProfileFlairRequest, type ProfileFrameId } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import type { ProService } from "../subscriptions/pro.js";
import { needsAlias } from "../users/display-name.js";

type CosmeticsRow = typeof schema.userCosmetics.$inferSelect;

const DEFAULT_FRAME: ProfileFrameId = "none";
const DEFAULT_NAME_COLOR: NameColorId = "default";

function isDefault(frame: string, nameColor: string): boolean {
  return frame === DEFAULT_FRAME && nameColor === DEFAULT_NAME_COLOR;
}

/** Pro "Perfil destacado": the preset frame and name color a paid user picked. */
export class UserCosmeticsService {
  constructor(
    private readonly db: Db,
    private readonly pro: ProService,
    private readonly clock: Clock,
  ) {}

  /** Defaults when no row / missing table. visibleToOthers = paid && profile shows identity (not alias). */
  async getMine(userId: string): Promise<MyCosmeticsDto> {
    const row = await orDefault(() => this.readRow(userId), undefined);
    return { ...this.valuesOf(row), visibleToOthers: await this.visibleToOthers(userId) };
  }

  /** Same values -> no write. Both defaults -> delete row if any (no insert). Missing table -> ApiErrors.featureDisabled(). */
  async putMine(userId: string, input: ProfileFlairRequest): Promise<MyCosmeticsDto> {
    try {
      this.db.transaction((tx) => {
        const current = tx.select().from(schema.userCosmetics).where(eq(schema.userCosmetics.userId, userId)).get();
        if (isDefault(input.frame, input.nameColor)) {
          if (current) tx.delete(schema.userCosmetics).where(eq(schema.userCosmetics.userId, userId)).run();
          return;
        }
        if (current && current.frame === input.frame && current.nameColor === input.nameColor) return;
        const updatedAt = this.clock.now();
        tx.insert(schema.userCosmetics)
          .values({ userId, frame: input.frame, nameColor: input.nameColor, updatedAt })
          .onConflictDoUpdate({
            target: schema.userCosmetics.userId,
            set: { frame: input.frame, nameColor: input.nameColor, updatedAt },
          })
          .run();
      });
    } catch (err) {
      if (isMissingSchemaError(err)) throw ApiErrors.featureDisabled();
      throw err;
    }
    return this.getMine(userId);
  }

  /** Batched (inChunks) lookup restricted to `eligible` ids; omits all-default rows and unknown enum values. Missing table -> empty Map. Zero writes. */
  async flairFor(eligible: ReadonlySet<string>): Promise<Map<string, ProfileFlairDto>> {
    const result = new Map<string, ProfileFlairDto>();
    if (eligible.size === 0) return result;
    const rows = await orDefault(
      () => inChunks([...eligible], (part) => this.db.select().from(schema.userCosmetics).where(inArray(schema.userCosmetics.userId, part)).all()),
      [] as CosmeticsRow[],
    );
    for (const row of rows) {
      if (!eligible.has(row.userId)) continue;
      if (!(PROFILE_FRAMES as readonly string[]).includes(row.frame) || !(NAME_COLORS as readonly string[]).includes(row.nameColor)) continue;
      if (isDefault(row.frame, row.nameColor)) continue;
      result.set(row.userId, { frame: row.frame as ProfileFrameId, nameColor: row.nameColor as NameColorId });
    }
    return result;
  }

  private async readRow(userId: string) {
    return this.db.select().from(schema.userCosmetics).where(eq(schema.userCosmetics.userId, userId)).get();
  }

  private valuesOf(row: CosmeticsRow | undefined): ProfileFlairDto {
    if (!row) return { frame: DEFAULT_FRAME, nameColor: DEFAULT_NAME_COLOR };
    const frame = (PROFILE_FRAMES as readonly string[]).includes(row.frame) ? (row.frame as ProfileFrameId) : DEFAULT_FRAME;
    const nameColor = (NAME_COLORS as readonly string[]).includes(row.nameColor) ? (row.nameColor as NameColorId) : DEFAULT_NAME_COLOR;
    return { frame, nameColor };
  }

  /** Paid right now and shown under a visible identity (never an alias). */
  private async visibleToOthers(userId: string): Promise<boolean> {
    if (!(await this.pro.badgeIds([userId])).has(userId)) return false;
    const profile = this.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId)).get();
    return Boolean(profile) && !needsAlias(profile!);
  }
}
