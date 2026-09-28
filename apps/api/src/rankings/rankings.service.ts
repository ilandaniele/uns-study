import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { schema, type Db } from "@uns/database";
import type { RankingCategory, RankingDto, RankingEntryDto, RankingPeriod } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { displayName, visibleAvatarUrl } from "../users/display-name.js";

const STUDY_TIME_DAILY_CAP_MIN = 720;
const CONTRIBUTION_OBSERVATION_DAILY_CAP = 20;
const CONTRIBUTION_CHECKIN_DAILY_CAP = 5;
const STREAK_MIN_MINUTES = 30;

/** 'YYYY-MM-DD' in `tz` for `date`. */
function localDateOf(date: Date, tz: string): string {
  return format(toZonedTime(date, tz), "yyyy-MM-dd");
}

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

function cappedDailyCount(rows: { userId: string; createdAt: Date | string }[], tz: string, cap: number): Map<string, number> {
  const perUserDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = localDateOf(new Date(row.createdAt), tz);
    const byDay = perUserDay.get(row.userId) ?? new Map<string, number>();
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    perUserDay.set(row.userId, byDay);
  }
  const result = new Map<string, number>();
  for (const [userId, byDay] of perUserDay) {
    let total = 0;
    for (const count of byDay.values()) total += Math.min(count, cap);
    result.set(userId, total);
  }
  return result;
}

interface VisibilityInfo {
  visible: boolean;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Computes the three MVP+ ranking categories (`study_time`, `streak`, `contribution`) over the
 * PRD's four periods, scoped to one room and respecting each user's room-visibility privacy.
 */
@Injectable()
export class RankingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomsService) private readonly rooms: RoomsService,
  ) {}

  async getRankings(
    idOrSlug: string,
    period: RankingPeriod,
    category: RankingCategory,
    viewerUserId: string | null,
    now: Date = new Date(),
  ): Promise<RankingDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);

    const values =
      category === "study_time"
        ? await this.studyTimeValues(room, period, now)
        : category === "streak"
          ? await this.streakValues(room, now)
          : await this.contributionValues(room, period, now);

    const userIds = [...values.keys()];
    const visibilityUserIds = viewerUserId && !userIds.includes(viewerUserId) ? [...userIds, viewerUserId] : userIds;
    const visibility = await this.visibilityInfo(visibilityUserIds);

    const entries: RankingEntryDto[] = [];
    for (const [userId, value] of values) {
      if (value <= 0) continue;
      const info = visibility.get(userId);
      if (!info?.visible) continue;
      entries.push({ rank: 0, userId, displayName: info.displayName, avatarUrl: info.avatarUrl, value });
    }
    entries.sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));
    entries.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    let me: RankingEntryDto | null = null;
    if (viewerUserId) {
      const info = visibility.get(viewerUserId);
      const inList = entries.find((e) => e.userId === viewerUserId);
      me = {
        rank: inList?.rank ?? 0,
        userId: viewerUserId,
        displayName: info?.displayName ?? "Usuario anónimo",
        avatarUrl: info?.avatarUrl ?? null,
        value: values.get(viewerUserId) ?? 0,
      };
    }

    return { period, category, entries, me };
  }

  private async visibilityInfo(userIds: string[]): Promise<Map<string, VisibilityInfo>> {
    const result = new Map<string, VisibilityInfo>();
    if (!userIds.length) return result;

    const profiles = await this.db.select().from(schema.userProfiles).where(inArray(schema.userProfiles.userId, userIds));
    const privacyRows = await this.db.select().from(schema.userPrivacySettings).where(inArray(schema.userPrivacySettings.userId, userIds));
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const privacyByUser = new Map(privacyRows.map((p) => [p.userId, p]));

    for (const userId of userIds) {
      const profile = profileByUser.get(userId) ?? null;
      const privacy = privacyByUser.get(userId) ?? null;
      const visible = Boolean(privacy?.showInRoom) || Boolean(profile && profile.identityMode !== "HIDDEN");
      result.set(userId, {
        visible,
        displayName: displayName(profile, privacy, "Usuario anónimo"),
        avatarUrl: visibleAvatarUrl(profile, privacy),
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

    const perUserDay = groupByUserDay(rows.map((r) => ({ userId: r.userId, day: r.localDate, value: r.minutes })));
    const values = new Map<string, number>();
    for (const [userId, byDay] of perUserDay) {
      let total = 0;
      for (const minutes of byDay.values()) total += Math.min(minutes, STUDY_TIME_DAILY_CAP_MIN);
      values.set(userId, total);
    }
    return values;
  }

  private async streakValues(room: { id: string; timezone: string }, now: Date): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ userId: schema.studySessions.userId, localDate: schema.studySessions.localDate, minutes: schema.studySessions.verifiedMinutes })
      .from(schema.studySessions)
      .where(eq(schema.studySessions.roomId, room.id));

    const perUserDay = groupByUserDay(rows.map((r) => ({ userId: r.userId, day: r.localDate, value: r.minutes })));
    const today = localDateOf(now, room.timezone);

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
    const obsRows = await this.db
      .select({ userId: schema.seatObservations.userId, createdAt: schema.seatObservations.createdAt })
      .from(schema.seatObservations)
      .where(and(...obsConditions));

    const ciConditions = [eq(schema.checkIns.roomId, room.id)];
    if (fromUtc) ciConditions.push(gte(schema.checkIns.createdAt, fromUtc));
    if (toUtcExclusive) ciConditions.push(lt(schema.checkIns.createdAt, toUtcExclusive));
    const ciRows = await this.db
      .select({ userId: schema.checkIns.userId, createdAt: schema.checkIns.createdAt })
      .from(schema.checkIns)
      .where(and(...ciConditions));

    const obsPoints = cappedDailyCount(obsRows, room.timezone, CONTRIBUTION_OBSERVATION_DAILY_CAP);
    const ciPoints = cappedDailyCount(ciRows, room.timezone, CONTRIBUTION_CHECKIN_DAILY_CAP);

    const values = new Map<string, number>();
    for (const [userId, points] of obsPoints) values.set(userId, (values.get(userId) ?? 0) + points);
    for (const [userId, points] of ciPoints) values.set(userId, (values.get(userId) ?? 0) + points);
    return values;
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
