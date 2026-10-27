import type { AdminBadgeLevel } from "@sala/contracts";
import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { inChunks, schema, type Db } from "@sala/database";
import type { ProfileFlairDto, RankingCategory, RankingDto, RankingEntryDto, RankingPeriod } from "@sala/contracts";
import { minutesByLocalDay, verifiedMinutesFor } from "./study-session.service.js";
import { localDateOf } from "../common/dates.js";
import { STREAK_LOOKBACK_DAYS, STREAK_MIN_MINUTES } from "../study-history/streak.js";
import { loadFrozenDates } from "../study-history/frozen-dates.js";
import type { RoomsService } from "../rooms/rooms.service.js";
import { displayName, needsAlias, showsAdminBadge, shownAliasAnimal, visibleAvatarUrl } from "../users/display-name.js";
import type { RolesService } from "../users/roles.service.js";
import type { AliasService } from "../users/alias.service.js";
import type { ProService } from "../subscriptions/pro.js";
import type { UserCosmeticsService } from "../cosmetics/cosmetics.service.js";

const STUDY_TIME_DAILY_CAP_MIN = 720;
const CONTRIBUTION_OBSERVATION_DAILY_CAP = 20;
const CONTRIBUTION_CHECKIN_DAILY_CAP = 5;
const RAW_CACHE_TTL_MS = 60_000;

function addDaysToLocal(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Inclusive local-date `[start, end]` bounds for `period`, anchored on `todayLocal`. `null` bounds mean unbounded. */
function periodLocalBounds(period: RankingPeriod, todayLocal: string): { start: string | null; end: string | null } {
  if (period === "today") return { start: todayLocal, end: todayLocal };
  if (period === "week") {
    const dow = new Date(`${todayLocal}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    const offsetFromMonday = (dow + 6) % 7;
    const start = addDaysToLocal(todayLocal, -offsetFromMonday);
    return { start, end: addDaysToLocal(start, 6) };
  }
  if (period === "month") {
    const [year, month] = todayLocal.split("-").map(Number) as [number, number];
    const start = `${todayLocal.slice(0, 7)}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start, end: `${todayLocal.slice(0, 7)}-${String(lastDay).padStart(2, "0")}` };
  }
  return { start: null, end: null }; // all
}

/** Current consecutive-day streak ending today or yesterday, given the ascending list of qualifying local dates. */
function currentStreak(qualifyingDatesAsc: string[], todayLocal: string): number {
  if (!qualifyingDatesAsc.length) return 0;
  const mostRecent = qualifyingDatesAsc[qualifyingDatesAsc.length - 1]!;
  const gapFromToday = daysBetween(todayLocal, mostRecent);
  if (gapFromToday < 0 || gapFromToday > 1) return 0; // last qualifying day isn't today or yesterday: streak is broken

  const set = new Set(qualifyingDatesAsc);
  let streak = 1;
  let cursor = mostRecent;
  for (;;) {
    const prev = addDaysToLocal(cursor, -1);
    if (!set.has(prev)) break;
    streak++;
    cursor = prev;
  }
  return streak;
}

export interface RankingIdentity {
  /** Appears in the ranking list at all. */
  visible: boolean;
  /** Opted out of rankings entirely (`showInRanking: false`) — excluded even from their own `me` row. */
  hiddenFromRanking: boolean;
  displayName: string;
  avatarUrl: string | null;
  aliasAnimal: string | undefined;
  adminBadge: AdminBadgeLevel;
  /** Paid Pro subscription, shown only next to a visible identity. */
  proBadge: boolean;
  /** `false` whenever the entry must not be linkable: not opted into room visibility, or the shown
   *  name is the random alias rather than a chosen identity. */
  linkable: boolean;
  /** Pro profile flair; set only for paid users shown with a visible identity. */
  flair?: ProfileFlairDto;
}

/** One ranking row from a user's identity. `userId` is hidden unless the entry is linkable. */
export function toRankingEntry(userId: string, info: RankingIdentity, rank: number, value: number, viewerUserId: string | null): RankingEntryDto {
  return {
    rank,
    userId: info.linkable ? userId : null,
    displayName: info.displayName,
    avatarUrl: info.avatarUrl,
    aliasAnimal: info.aliasAnimal,
    adminBadge: info.adminBadge,
    proBadge: info.proBadge,
    ...(info.flair ? { flair: info.flair } : {}),
    isMe: userId === viewerUserId,
    value,
  };
}

/** Public ranking lists show at most this many users; the viewer's own entry is returned separately. */
const RANKING_PUBLIC_LIMIT = 100;

/**
 * Computes the three MVP+ ranking categories (`study_time`, `streak`, `contribution`) over the
 * PRD's four periods, scoped to one room and respecting each user's room-visibility privacy.
 */
export class RankingsService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly aliases: AliasService,
    private readonly roles: RolesService,
    /** Pro badge lookups; null in tests that construct the service directly. */
    private readonly pro: ProService | null = null,
    /** Pro profile flair; null in tests that construct the service directly. */
    private readonly cosmetics: UserCosmeticsService | null = null,
  ) {}

  /** Raw (viewer-independent) ranking values per `roomId|period|category`, invalidated by TTL only. */
  private readonly rawCache = new Map<string, { at: number; values: Map<string, number> }>();

  /** Viewer-independent values for room+period+category from the 60 s rawCache (nowOverride bypasses it). */
  async rawValues(
    room: { id: string; timezone: string },
    period: RankingPeriod,
    category: RankingCategory,
    nowOverride?: Date,
  ): Promise<Map<string, number>> {
    const now = nowOverride ?? new Date();
    // An explicit `now` (tests, backfills) always recomputes; live requests share the TTL cache.
    const cacheKey = `${room.id}|${period}|${category}`;
    const cached = nowOverride ? undefined : this.rawCache.get(cacheKey);
    if (cached && Date.now() - cached.at < RAW_CACHE_TTL_MS) return cached.values;
    const values =
      category === "study_time"
        ? await this.studyTimeValues(room, period, now)
        : category === "streak"
          ? await this.streakValues(room, now)
          : await this.contributionValues(room, period, now);
    if (!nowOverride) this.rawCache.set(cacheKey, { at: Date.now(), values });
    return values;
  }

  async getRankings(
    idOrSlug: string,
    period: RankingPeriod,
    category: RankingCategory,
    viewerUserId: string | null,
    nowOverride?: Date,
  ): Promise<RankingDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const values = await this.rawValues(room, period, category, nowOverride);

    // Only the top RANKING_PUBLIC_LIMIT visible users are public. Candidates are walked best-first in
    // batches so the visibility lookup never has to cover every user in the room.
    const candidates = [...values.entries()]
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const visibility = new Map<string, RankingIdentity>();
    const entries: (RankingEntryDto & { realUserId: string })[] = [];
    for (let i = 0; i < candidates.length && entries.length < RANKING_PUBLIC_LIMIT; i += RANKING_PUBLIC_LIMIT) {
      const batch = candidates.slice(i, i + RANKING_PUBLIC_LIMIT);
      for (const [userId, info] of await this.identities(batch.map(([id]) => id))) visibility.set(userId, info);
      for (const [userId, value] of batch) {
        if (entries.length >= RANKING_PUBLIC_LIMIT) break;
        const info = visibility.get(userId);
        if (!info?.visible || info.hiddenFromRanking) continue;
        entries.push({ ...toRankingEntry(userId, info, entries.length + 1, value, viewerUserId), realUserId: userId });
      }
    }
    const publicEntries: RankingEntryDto[] = entries.map(({ realUserId: _realUserId, ...entry }) => entry);

    let me: RankingEntryDto | null = null;
    if (viewerUserId) {
      if (!visibility.has(viewerUserId)) {
        for (const [userId, info] of await this.identities([viewerUserId])) visibility.set(userId, info);
      }
      const info = visibility.get(viewerUserId);
      if (info && !info.hiddenFromRanking) {
        const inList = entries.find((e) => e.realUserId === viewerUserId);
        const myValue = values.get(viewerUserId) ?? 0;
        // Outside the public list the exact visible rank would need every user's visibility, so it is
        // approximated from the raw values (hidden users included).
        const approxRank = info.visible && myValue > 0 ? candidates.findIndex(([id]) => id === viewerUserId) + 1 : 0;
        me = toRankingEntry(viewerUserId, info, inList?.rank ?? approxRank, myValue, viewerUserId);
      }
    }

    return { period, category, entries: publicEntries, me };
  }

  /** Was the private visibilityInfo(). */
  async identities(userIds: string[]): Promise<Map<string, RankingIdentity>> {
    const result = new Map<string, RankingIdentity>();
    if (!userIds.length) return result;

    const profiles = inChunks(userIds, (part) => this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, part)).all());
    const privacyRows = inChunks(userIds, (part) =>
      this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, part)).all(),
    );
    const aliasByUser = await this.aliases.ensureAliasesForProfiles(profiles);
    const admins = await this.roles.adminBadges(userIds);
    const proIds = this.pro ? await this.pro.badgeIds(userIds) : new Set<string>();
    // Flair only for paid users shown under a visible identity, never an alias.
    const flairEligible = new Set(profiles.filter((p) => proIds.has(p.userId) && !needsAlias(p)).map((p) => p.userId));
    const flairByUser = this.cosmetics ? await this.cosmetics.flairFor(flairEligible) : new Map<string, ProfileFlairDto>();
    const profileByUser = new Map(profiles.map((p) => [p.userId, { ...p, alias: aliasByUser.get(p.userId) ?? p.alias }]));
    const privacyByUser = new Map(privacyRows.map((p) => [p.userId, p]));

    for (const userId of userIds) {
      const profile = profileByUser.get(userId) ?? null;
      const privacy = privacyByUser.get(userId) ?? null;
      // A profile row (even HIDDEN) is visible under its alias — only a user with no profile stays out.
      const visible = Boolean(profile);
      // Not linkable (userId hidden from the response) while the name shown is just the alias — an
      // alias is a fun label, not an identity. A visible identity mode is always linkable.
      const shownAsAlias = !profile || needsAlias(profile);
      const linkable = !shownAsAlias;
      const flair = !shownAsAlias ? flairByUser.get(userId) : undefined;
      result.set(userId, {
        ...(flair ? { flair } : {}),
        visible,
        hiddenFromRanking: privacy?.showInRanking === false,
        displayName: displayName(profile, privacy, "Usuario anónimo"),
        // Photo only for visible-name users who enabled `showAvatar` (07_SECURITY §privacy).
        avatarUrl: profile && !needsAlias(profile) ? visibleAvatarUrl(profile, privacy) : null,
        aliasAnimal: shownAliasAnimal(profile) ?? undefined,
        adminBadge: showsAdminBadge(admins.get(userId) ?? false, profile, privacy),
        proBadge: !shownAsAlias && proIds.has(userId),
        linkable,
      });
    }
    return result;
  }

  private async studyTimeValues(room: { id: string; timezone: string }, period: RankingPeriod, now: Date): Promise<Map<string, number>> {
    const today = localDateOf(now, room.timezone);
    const { start, end } = periodLocalBounds(period, today);
    const { tracked, manual } = await this.studyMinutesByUserDay(room, start, end, now);

    // Cap per (user, local day) after merging every tracked source, then sum the capped days per user.
    // Admin credits (MANUAL) are added on top, uncapped: the admin decides how much they are worth.
    const values = new Map<string, number>();
    for (const [userId, byDay] of tracked) {
      let total = 0;
      for (const minutes of byDay.values()) total += Math.min(minutes, STUDY_TIME_DAILY_CAP_MIN);
      values.set(userId, total);
    }
    // Negative credits (time taken away) can lower a total, never below zero.
    for (const [userId, byDay] of manual) {
      let total = values.get(userId) ?? 0;
      for (const minutes of byDay.values()) total += minutes;
      values.set(userId, Math.max(0, total));
    }
    return values;
  }

  /**
   * Uncapped study minutes per user per local day within `[start, end]` (inclusive, `null` = unbounded):
   * closed `study_sessions` plus still-ACTIVE check-ins counted live up to `now`. Every stay is split
   * at local midnight, so a 22:00-04:00 session credits both days.
   */
  private async studyMinutesByUserDay(
    room: { id: string; timezone: string },
    start: string | null,
    end: string | null,
    now: Date,
  ): Promise<{ tracked: Map<string, Map<string, number>>; manual: Map<string, Map<string, number>> }> {
    // A session is at most MAX_VERIFIED_MINUTES (12h) long, so it spans at most its start day and the
    // next one: sessions that started the day before `start` can still spill into the range.
    const conditions = [eq(schema.studySessions.roomId, room.id)];
    if (start) conditions.push(gte(schema.studySessions.localDate, addDaysToLocal(start, -1)));
    if (end) conditions.push(lte(schema.studySessions.localDate, end));
    const sessions = this.db
      .select({
        userId: schema.studySessions.userId,
        checkInId: schema.studySessions.checkInId,
        startedAt: schema.studySessions.startedAt,
        minutes: schema.studySessions.verifiedMinutes,
        localDate: schema.studySessions.localDate,
        source: schema.studySessions.source,
      })
      .from(schema.studySessions)
      .where(and(...conditions))
      .all();

    // A check-in only leaves ACTIVE in the same transaction that writes its session row, but skip
    // any live check-in that already has one anyway so the two can never count twice.
    const recorded = new Set(sessions.map((s) => s.checkInId).filter((id): id is string => id !== null));
    const live = (await this.activeLiveMinutes(room, now)).filter((c) => !recorded.has(c.checkInId));

    const inRange = (day: string) => (!start || day >= start) && (!end || day <= end);
    const parts: { userId: string; day: string; value: number }[] = [];
    const manualParts: { userId: string; day: string; value: number }[] = [];
    for (const s of sessions) {
      if (s.source === "MANUAL" && inRange(s.localDate)) manualParts.push({ userId: s.userId, day: s.localDate, value: s.minutes });
    }
    for (const stay of [...sessions.filter((s) => s.source !== "MANUAL"), ...live]) {
      for (const part of minutesByLocalDay(stay.startedAt, stay.minutes, room.timezone)) {
        if ((!start || part.day >= start) && (!end || part.day <= end)) parts.push({ userId: stay.userId, day: part.day, value: part.minutes });
      }
    }
    return { tracked: groupByUserDay(parts), manual: groupByUserDay(manualParts) };
  }

  /**
   * Live verified minutes of each ACTIVE check-in in the room. Includes ones past `expiresAt` that the
   * expiration sweep hasn't closed yet (`verifiedMinutesFor` clamps them to their expiry), so their
   * minutes don't vanish from the ranking between expiry and the sweep.
   */
  private async activeLiveMinutes(
    room: { id: string; timezone: string },
    now: Date,
  ): Promise<{ checkInId: string; userId: string; startedAt: Date; minutes: number }[]> {
    const active = this.db
      .select({ id: schema.checkIns.id, userId: schema.checkIns.userId, startedAt: schema.checkIns.startedAt, expiresAt: schema.checkIns.expiresAt })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, room.id), eq(schema.checkIns.status, "ACTIVE")))
      .all();
    return active.map((c) => ({
      checkInId: c.id,
      userId: c.userId,
      startedAt: c.startedAt,
      minutes: verifiedMinutesFor(c.startedAt, c.expiresAt, now),
    }));
  }

  private async streakValues(room: { id: string; timezone: string }, now: Date): Promise<Map<string, number>> {
    const today = localDateOf(now, room.timezone);
    const since = addDaysToLocal(today, -STREAK_LOOKBACK_DAYS);
    const { tracked, manual } = await this.studyMinutesByUserDay(room, since, null, now);
    const perUserDay = groupByUserDay(
      [...tracked, ...manual].flatMap(([userId, byDay]) => [...byDay].map(([day, value]) => ({ userId, day, value }))),
    );
    // Pro streak freezes: a frozen day counts as studied (one extra query; the raw cache absorbs it).
    const frozenByUser = await loadFrozenDates(this.db, [...perUserDay.keys()], since);

    const values = new Map<string, number>();
    for (const [userId, byDay] of perUserDay) {
      const qualifying = new Set([...byDay.entries()].filter(([, minutes]) => minutes >= STREAK_MIN_MINUTES).map(([day]) => day));
      for (const day of frozenByUser.get(userId) ?? []) qualifying.add(day);
      const qualifyingDaysAsc = [...qualifying].sort();
      values.set(userId, currentStreak(qualifyingDaysAsc, today));
    }
    return values;
  }

  private async contributionValues(room: { id: string; timezone: string }, period: RankingPeriod, now: Date): Promise<Map<string, number>> {
    const today = localDateOf(now, room.timezone);
    const { start, end } = periodLocalBounds(period, today);
    const fromUtc = start ? fromZonedTime(`${start}T00:00:00`, room.timezone) : undefined;
    const toUtcExclusive = end ? fromZonedTime(`${addDaysToLocal(end, 1)}T00:00:00`, room.timezone) : undefined;

    const obsConditions = [eq(schema.seatObservations.roomId, room.id)];
    if (fromUtc) obsConditions.push(gte(schema.seatObservations.createdAt, fromUtc));
    if (toUtcExclusive) obsConditions.push(lt(schema.seatObservations.createdAt, toUtcExclusive));

    const ciConditions = [eq(schema.checkIns.roomId, room.id)];
    if (fromUtc) ciConditions.push(gte(schema.checkIns.createdAt, fromUtc));
    if (toUtcExclusive) ciConditions.push(lt(schema.checkIns.createdAt, toUtcExclusive));

    const obsPoints = this.cappedDailyCount(
      this.db
        .select({ userId: schema.seatObservations.userId, createdAt: schema.seatObservations.createdAt })
        .from(schema.seatObservations)
        .where(and(...obsConditions))
        .all(),
      room.timezone,
      CONTRIBUTION_OBSERVATION_DAILY_CAP,
    );
    const ciPoints = this.cappedDailyCount(
      this.db
        .select({ userId: schema.checkIns.userId, createdAt: schema.checkIns.createdAt })
        .from(schema.checkIns)
        .where(and(...ciConditions))
        .all(),
      room.timezone,
      CONTRIBUTION_CHECKIN_DAILY_CAP,
    );

    const values = new Map<string, number>();
    for (const [userId, points] of obsPoints) values.set(userId, (values.get(userId) ?? 0) + points);
    for (const [userId, points] of ciPoints) values.set(userId, (values.get(userId) ?? 0) + points);
    return values;
  }

  /** Per user: sum over local days (in `tz`) of `min(count, cap)`, bucketed in JS. */
  private cappedDailyCount(rows: { userId: string; createdAt: Date }[], tz: string, cap: number): Map<string, number> {
    const perUserDay = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const day = localDateOf(row.createdAt, tz);
      const byDay = perUserDay.get(row.userId) ?? new Map<string, number>();
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      perUserDay.set(row.userId, byDay);
    }
    const totals = new Map<string, number>();
    for (const [userId, byDay] of perUserDay) {
      let total = 0;
      for (const count of byDay.values()) total += Math.min(count, cap);
      totals.set(userId, total);
    }
    return totals;
  }
}

function groupByUserDay(rows: { userId: string; day: string; value: number }[]): Map<string, Map<string, number>> {
  const perUserDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const byDay = perUserDay.get(row.userId) ?? new Map<string, number>();
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.value);
    perUserDay.set(row.userId, byDay);
  }
  return perUserDay;
}
