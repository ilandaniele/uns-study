import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { fromZonedTime } from "date-fns-tz";
import { schema, type Db } from "@sala/database";
import type { RankingCategory, RankingDto, RankingEntryDto, RankingPeriod } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { verifiedMinutesFor } from "./study-session.service.js";
import { localDateOf } from "../common/dates.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { displayName, needsAlias, showsAdminBadge, shownAliasAnimal, visibleAvatarUrl } from "../users/display-name.js";
import { RolesService } from "../users/roles.service.js";
import { AliasService } from "../users/alias.service.js";

const STUDY_TIME_DAILY_CAP_MIN = 720;
const CONTRIBUTION_OBSERVATION_DAILY_CAP = 20;
const CONTRIBUTION_CHECKIN_DAILY_CAP = 5;
const STREAK_MIN_MINUTES = 30;
/** Streaks only look back this many days (longer streaks are capped at what the window can prove). */
const STREAK_LOOKBACK_DAYS = 400;
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

interface VisibilityInfo {
  /** Appears in the ranking list at all. */
  visible: boolean;
  /** Opted out of rankings entirely (`showInRanking: false`) — excluded even from their own `me` row. */
  hiddenFromRanking: boolean;
  displayName: string;
  avatarUrl: string | null;
  aliasAnimal: string | undefined;
  adminBadge: boolean;
  /** `false` whenever the entry must not be linkable: not opted into room visibility, or the shown
   *  name is the random alias rather than a chosen identity. */
  linkable: boolean;
}

/** Public ranking lists show at most this many users; the viewer's own entry is returned separately. */
const RANKING_PUBLIC_LIMIT = 100;

/**
 * Computes the three MVP+ ranking categories (`study_time`, `streak`, `contribution`) over the
 * PRD's four periods, scoped to one room and respecting each user's room-visibility privacy.
 */
@Injectable()
export class RankingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(AliasService) private readonly aliases: AliasService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  /** Raw (viewer-independent) ranking values per `roomId|period|category`, invalidated by TTL only. */
  private readonly rawCache = new Map<string, { at: number; values: Map<string, number> }>();

  async getRankings(
    idOrSlug: string,
    period: RankingPeriod,
    category: RankingCategory,
    viewerUserId: string | null,
    nowOverride?: Date,
  ): Promise<RankingDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const now = nowOverride ?? new Date();

    // An explicit `now` (tests, backfills) always recomputes; live requests share the TTL cache.
    const cacheKey = `${room.id}|${period}|${category}`;
    const cached = nowOverride ? undefined : this.rawCache.get(cacheKey);
    let values: Map<string, number>;
    if (cached && Date.now() - cached.at < RAW_CACHE_TTL_MS) {
      values = cached.values;
    } else {
      values =
        category === "study_time"
          ? await this.studyTimeValues(room, period, now)
          : category === "streak"
            ? await this.streakValues(room, now)
            : await this.contributionValues(room, period, now);
      if (!nowOverride) this.rawCache.set(cacheKey, { at: Date.now(), values });
    }

    // Only the top RANKING_PUBLIC_LIMIT visible users are public. Candidates are walked best-first in
    // batches so the visibility lookup never has to cover every user in the room.
    const candidates = [...values.entries()]
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const visibility = new Map<string, VisibilityInfo>();
    const entries: (RankingEntryDto & { realUserId: string })[] = [];
    for (let i = 0; i < candidates.length && entries.length < RANKING_PUBLIC_LIMIT; i += RANKING_PUBLIC_LIMIT) {
      const batch = candidates.slice(i, i + RANKING_PUBLIC_LIMIT);
      for (const [userId, info] of await this.visibilityInfo(batch.map(([id]) => id))) visibility.set(userId, info);
      for (const [userId, value] of batch) {
        if (entries.length >= RANKING_PUBLIC_LIMIT) break;
        const info = visibility.get(userId);
        if (!info?.visible || info.hiddenFromRanking) continue;
        entries.push({
          rank: entries.length + 1,
          userId: info.linkable ? userId : null,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
          aliasAnimal: info.aliasAnimal,
          adminBadge: info.adminBadge,
          isMe: userId === viewerUserId,
          value,
          realUserId: userId,
        });
      }
    }
    const publicEntries: RankingEntryDto[] = entries.map(({ realUserId: _realUserId, ...entry }) => entry);

    let me: RankingEntryDto | null = null;
    if (viewerUserId) {
      if (!visibility.has(viewerUserId)) {
        for (const [userId, info] of await this.visibilityInfo([viewerUserId])) visibility.set(userId, info);
      }
      const info = visibility.get(viewerUserId);
      if (info && !info.hiddenFromRanking) {
        const inList = entries.find((e) => e.realUserId === viewerUserId);
        const myValue = values.get(viewerUserId) ?? 0;
        // Outside the public list the exact visible rank would need every user's visibility, so it is
        // approximated from the raw values (hidden users included).
        const approxRank = info.visible && myValue > 0 ? candidates.findIndex(([id]) => id === viewerUserId) + 1 : 0;
        me = {
          rank: inList?.rank ?? approxRank,
          userId: info.linkable ? viewerUserId : null,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
          aliasAnimal: info.aliasAnimal,
          adminBadge: info.adminBadge,
          isMe: true,
          value: myValue,
        };
      }
    }

    return { period, category, entries: publicEntries, me };
  }

  private async visibilityInfo(userIds: string[]): Promise<Map<string, VisibilityInfo>> {
    const result = new Map<string, VisibilityInfo>();
    if (!userIds.length) return result;

    const profiles = await this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, userIds));
    const privacyRows = await this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, userIds));
    const aliasByUser = await this.aliases.ensureAliasesForProfiles(profiles);
    const admins = await this.roles.adminIds(userIds);
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
      result.set(userId, {
        visible,
        hiddenFromRanking: privacy?.showInRanking === false,
        displayName: displayName(profile, privacy, "Usuario anónimo"),
        // Photo only for visible-name users who enabled `showAvatar` (07_SECURITY §privacy).
        avatarUrl: profile && !needsAlias(profile) ? visibleAvatarUrl(profile, privacy) : null,
        aliasAnimal: shownAliasAnimal(profile) ?? undefined,
        adminBadge: showsAdminBadge(admins.has(userId), profile, privacy),
        linkable,
      });
    }
    return result;
  }

  private async studyTimeValues(room: { id: string; timezone: string }, period: RankingPeriod, now: Date): Promise<Map<string, number>> {
    const today = localDateOf(now, room.timezone);
    const { start, end } = periodLocalBounds(period, today);

    const conditions = [eq(schema.studySessions.roomId, room.id)];
    if (start) conditions.push(gte(schema.studySessions.localDate, start));
    if (end) conditions.push(lte(schema.studySessions.localDate, end));

    const rows = await this.db
      .select({ userId: schema.studySessions.userId, localDate: schema.studySessions.localDate, minutes: schema.studySessions.verifiedMinutes })
      .from(schema.studySessions)
      .where(and(...conditions));
    // Still-ACTIVE check-ins (e.g. renewed with "Sigo acá") have no session row yet: count them live.
    const live = (await this.activeLiveMinutes(room, now)).filter((r) => (!start || r.day >= start) && (!end || r.day <= end));

    // Cap per (user, local day) after merging live minutes, then sum the capped days per user.
    const perUserDay = groupByUserDay([...rows.map((r) => ({ userId: r.userId, day: r.localDate, value: r.minutes })), ...live]);
    const values = new Map<string, number>();
    for (const [userId, byDay] of perUserDay) {
      let total = 0;
      for (const minutes of byDay.values()) total += Math.min(minutes, STUDY_TIME_DAILY_CAP_MIN);
      values.set(userId, total);
    }
    return values;
  }

  /** Live verified minutes of each ACTIVE (unexpired) check-in in the room, keyed by its start's local day. */
  private async activeLiveMinutes(room: { id: string; timezone: string }, now: Date): Promise<{ userId: string; day: string; value: number }[]> {
    const active = await this.db
      .select({ userId: schema.checkIns.userId, startedAt: schema.checkIns.startedAt, expiresAt: schema.checkIns.expiresAt })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, room.id), eq(schema.checkIns.status, "ACTIVE"), gt(schema.checkIns.expiresAt, now)));
    return active.map((c) => ({
      userId: c.userId,
      day: localDateOf(c.startedAt, room.timezone),
      value: verifiedMinutesFor(c.startedAt, c.expiresAt, now),
    }));
  }

  private async streakValues(room: { id: string; timezone: string }, now: Date): Promise<Map<string, number>> {
    const today = localDateOf(now, room.timezone);
    const rows = await this.db
      .select({ userId: schema.studySessions.userId, localDate: schema.studySessions.localDate, minutes: schema.studySessions.verifiedMinutes })
      .from(schema.studySessions)
      .where(and(eq(schema.studySessions.roomId, room.id), gte(schema.studySessions.localDate, addDaysToLocal(today, -STREAK_LOOKBACK_DAYS))));

    const cutoff = addDaysToLocal(today, -STREAK_LOOKBACK_DAYS);
    const live = (await this.activeLiveMinutes(room, now)).filter((r) => r.day >= cutoff);
    const perUserDay = groupByUserDay([...rows.map((r) => ({ userId: r.userId, day: r.localDate, value: r.minutes })), ...live]);

    const values = new Map<string, number>();
    for (const [userId, byDay] of perUserDay) {
      const qualifyingDaysAsc = [...byDay.entries()]
        .filter(([, minutes]) => minutes >= STREAK_MIN_MINUTES)
        .map(([day]) => day)
        .sort();
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

    const [obsPoints, ciPoints] = await Promise.all([
      this.cappedDailyCount(schema.seatObservations, schema.seatObservations.userId, schema.seatObservations.createdAt, and(...obsConditions), room.timezone, CONTRIBUTION_OBSERVATION_DAILY_CAP),
      this.cappedDailyCount(schema.checkIns, schema.checkIns.userId, schema.checkIns.createdAt, and(...ciConditions), room.timezone, CONTRIBUTION_CHECKIN_DAILY_CAP),
    ]);

    const values = new Map<string, number>();
    for (const [userId, points] of obsPoints) values.set(userId, (values.get(userId) ?? 0) + points);
    for (const [userId, points] of ciPoints) values.set(userId, (values.get(userId) ?? 0) + points);
    return values;
  }

  /** Per user: sum over local days (in `tz`) of `LEAST(count(*), cap)`, computed in SQL. */
  private async cappedDailyCount(
    table: typeof schema.seatObservations | typeof schema.checkIns,
    userIdCol: PgColumn,
    createdAtCol: PgColumn,
    where: SQL | undefined,
    tz: string,
    cap: number,
  ): Promise<Map<string, number>> {
    const perDay = this.db
      .select({
        userId: sql<string>`${userIdCol}`.as("user_id"),
        capped: sql<number>`LEAST(count(*), ${cap})`.as("capped"),
      })
      .from(table)
      .where(where)
      .groupBy(userIdCol, sql`((${createdAtCol} AT TIME ZONE ${tz}::text))::date`)
      .as("per_day");
    const rows = await this.db
      .select({ userId: perDay.userId, total: sql<string>`sum(${perDay.capped})` })
      .from(perDay)
      .groupBy(perDay.userId);
    return new Map(rows.map((r) => [r.userId, Number(r.total)]));
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
