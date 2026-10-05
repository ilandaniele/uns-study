import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { animalIdFromAlias } from "@sala/contracts";
import { schema, type Db } from "@sala/database";
import { DB } from "../database/database.module.js";
import { randomAlias } from "./alias-generator.js";

const UNIQUE_VIOLATION = "23505";
const MAX_ATTEMPTS = 20;
const MAX_FALLBACK_ATTEMPTS = 20;

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Minimal shape of a `user_profiles` row this service needs to decide whether an alias is due. */
interface AliasableProfile {
  userId: string;
  identityMode: string;
  alias: string | null;
  /** `null` = alias predates the animal catalog (reassigned lazily); `undefined` = caller didn't load it. */
  aliasAnimal?: string | null;
}

/**
 * Assigns (once, permanently) the fun random alias shown instead of "Usuario anónimo" for
 * hidden users. Aliases live on `user_profiles.alias`, uniquely (case-insensitively) across all
 * users — assignment retries on collision, falling back to a numeric suffix after `MAX_ATTEMPTS`.
 * Every alias ever released is recorded in `retired_aliases` and never handed out again, so a
 * released alias can't later be reassigned to someone else and become ambiguous.
 * Aliases are always "<catalog animal> <adjective>"; the animal id is stored in `alias_animal`
 * (it drives the map illustration). A legacy alias whose noun isn't in the catalog is retired and
 * replaced by a fresh animal alias the next time it's ensured.
 */
@Injectable()
export class AliasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async isRetired(alias: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.retiredAliases.id })
      .from(schema.retiredAliases)
      .where(sql`lower(${schema.retiredAliases.alias}) = lower(${alias})`)
      .limit(1);
    return Boolean(row);
  }

  /** Returns the user's current alias, assigning one if they don't have one yet. */
  async ensureAlias(userId: string): Promise<string> {
    const [row] = await this.db
      .select({ alias: schema.userProfiles.alias, aliasAnimal: schema.userProfiles.aliasAnimal })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1);
    if (row?.alias) {
      if (row.aliasAnimal) return row.alias;
      const animal = animalIdFromAlias(row.alias);
      if (animal) {
        // Alias already uses a catalog animal (e.g. "Vizcacha Curiosa") — just record the animal.
        await this.db.update(schema.userProfiles).set({ aliasAnimal: animal }).where(eq(schema.userProfiles.userId, userId));
        return row.alias;
      }
      // Legacy noun (object / non-catalog animal): retire it and fall through to a new animal alias.
      await this.releaseAlias(userId);
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = randomAlias();
      if (await this.isRetired(candidate)) continue; // never reissue a previously-released alias

      try {
        const [updated] = await this.db
          .update(schema.userProfiles)
          .set({ alias: candidate, aliasAnimal: animalIdFromAlias(candidate), updatedAt: new Date() })
          .where(eq(schema.userProfiles.userId, userId))
          .returning({ alias: schema.userProfiles.alias });
        if (updated?.alias) return updated.alias;
        throw new Error("user_profiles row missing while assigning alias");
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Someone else already holds this exact alias — try another candidate.
      }
    }

    // Extremely unlikely after MAX_ATTEMPTS random draws; disambiguate with a numeric suffix,
    // retrying on collision (against either a live alias or a retired one) just like above.
    for (let attempt = 0; attempt < MAX_FALLBACK_ATTEMPTS; attempt++) {
      const fallback = `${randomAlias()} ${Math.floor(Math.random() * 90 + 10)}`;
      if (await this.isRetired(fallback)) continue;
      try {
        const [updated] = await this.db
          .update(schema.userProfiles)
          .set({ alias: fallback, aliasAnimal: animalIdFromAlias(fallback), updatedAt: new Date() })
          .where(eq(schema.userProfiles.userId, userId))
          .returning({ alias: schema.userProfiles.alias });
        if (updated?.alias) return updated.alias;
        throw new Error("user_profiles row missing while assigning fallback alias");
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }

    throw new Error(`alias-service: exhausted ${MAX_FALLBACK_ATTEMPTS} fallback attempts for user ${userId}`);
  }

  /** Frees the user's alias (e.g. they switched to a visible identity with a non-empty name) —
   *  and retires it forever so nobody else can ever be assigned the exact same alias again. */
  async releaseAlias(userId: string): Promise<void> {
    const [row] = await this.db.select({ alias: schema.userProfiles.alias }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId)).limit(1);
    await this.db.update(schema.userProfiles).set({ alias: null, aliasAnimal: null, updatedAt: new Date() }).where(eq(schema.userProfiles.userId, userId));
    if (row?.alias) {
      await this.db.insert(schema.retiredAliases).values({ alias: row.alias }).onConflictDoNothing();
    }
  }

  /**
   * Batch-backfills aliases for hidden profiles missing one (e.g. rows created before this
   * feature, or never touched via `/profiles/me`). Returns every alias found/assigned, keyed by
   * `userId`, for callers that already have the profile rows in hand (chat, DMs, rankings, etc.).
   */
  async ensureAliasesForProfiles(profiles: AliasableProfile[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const profile of profiles) {
      if (profile.alias && profile.aliasAnimal !== null) {
        result.set(profile.userId, profile.alias);
        continue;
      }
      if (!profile.alias && profile.identityMode !== "HIDDEN") continue;
      result.set(profile.userId, await this.ensureAlias(profile.userId));
    }
    return result;
  }

  /** Single-row convenience wrapper around `ensureAliasesForProfiles`, for call sites that only fetch one profile. */
  async withAlias<T extends AliasableProfile>(profile: T | null | undefined): Promise<T | null> {
    if (!profile) return null;
    const alias = (await this.ensureAliasesForProfiles([profile])).get(profile.userId) ?? profile.alias;
    return { ...profile, alias };
  }
}
