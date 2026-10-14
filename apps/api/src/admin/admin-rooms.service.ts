import { and, count, desc, eq, getTableColumns, gt, gte, sql } from "drizzle-orm";
import { chunk, rowsPerInsert, schema, type Db } from "@sala/database";
import type { GeofenceTestResultDto, LocationInput, RoomDailyStatDto, RoomGeofenceDto, RoomStatsDto } from "@sala/contracts";
import { env } from "../env.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { RolesService } from "../users/roles.service.js";
import { RoomCache } from "../common/cache/room-cache.service.js";

const HOURS_24_MS = 24 * 60 * 60 * 1000;
const DAY_MS = HOURS_24_MS;
const HOUR_MS = 60 * 60 * 1000;
const BA_TZ = "America/Argentina/Buenos_Aires";
/** Far above any user's reputation weight, so an admin mark wins the weighted-conflict rule against user FREE observations. */
const ADMIN_OVERRIDE_WEIGHT = 1000;

/** `en-CA` formats as `YYYY-MM-DD`. */
const baDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BA_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const baDay = (ms: number): string => baDayFormat.format(new Date(ms));

/** Upper bound of bound parameters per `seat_observations` row, for chunking the bulk insert. */
const OBSERVATION_COLUMN_COUNT = Object.keys(getTableColumns(schema.seatObservations)).length;

export interface AdminOccupantDto {
  seatId: string;
  seatCode: string;
  userId: string;
  name: string;
  /** Null unless the caller is an ADMIN (moderators never see emails). */
  email: string | null;
}

export class AdminRoomsService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly roomState: RoomStateService,
    private readonly presence: PresenceService,
    private readonly roles: RolesService,
    private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  /** Room map plus occupants with real names (no privacy filtering); emails only for ADMIN callers. */
  async live(idOrSlug: string, actorId: string) {
    const canSeeEmail = await this.roles.hasRole(actorId, ["ADMIN"]);
    const map = await this.rooms.getRoomMap(idOrSlug);
    const occupantRows = await this.db
      .select({ seatId: schema.checkIns.seatId, seatCode: schema.seats.code, userId: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .innerJoin(schema.user, eq(schema.user.id, schema.checkIns.userId))
      .where(and(eq(schema.checkIns.roomId, map.room.id), eq(schema.checkIns.status, "ACTIVE")));

    const occupants: AdminOccupantDto[] = occupantRows.map((r) => ({ seatId: r.seatId, seatCode: r.seatCode, userId: r.userId, name: r.name, email: canSeeEmail ? r.email : null }));
    return { map, occupants };
  }

  /** Fresh Seat Coverage = share of active seats with valid recent evidence (i.e. not UNKNOWN). */
  async stats(idOrSlug: string): Promise<RoomStatsDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - HOURS_24_MS);

    const liveStates = await this.roomState.getLiveSeatStates(room.id, now);
    const total = liveStates.size;
    const withEvidence = [...liveStates.values()].filter((s) => s.status !== "UNKNOWN").length;
    const freshSeatCoverage = total > 0 ? withEvidence / total : 0;

    const [activeCheckIns] = await this.db
      .select({ value: count() })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, room.id), eq(schema.checkIns.status, "ACTIVE")));
    const [observations24h] = await this.db
      .select({ value: count() })
      .from(schema.seatObservations)
      .where(and(eq(schema.seatObservations.roomId, room.id), gte(schema.seatObservations.createdAt, dayAgo)));
    const [checkIns24h] = await this.db
      .select({ value: count() })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, room.id), gte(schema.checkIns.createdAt, dayAgo)));

    const usage = await this.usageMetrics(room.id, now);
    const dailyStats = await this.dailyStats(room.id);
    const [qr30d] = await this.db
      .select({
        total: count(),
        verified: sql<number>`count(*) filter (where ${schema.seatObservations.qrVerified})`.mapWith(Number),
      })
      .from(schema.seatObservations)
      .where(
        and(
          eq(schema.seatObservations.roomId, room.id),
          eq(schema.seatObservations.adminOverride, false),
          gte(schema.seatObservations.createdAt, new Date(now.getTime() - 30 * DAY_MS)),
        ),
      );
    const observations30d = Number(qr30d?.total ?? 0);
    const qrVerifiedObservations30d = Number(qr30d?.verified ?? 0);

    return {
      ...usage,
      dailyStats,
      observations30d,
      qrVerifiedObservations30d,
      qrVerifiedObservationShare30d: observations30d > 0 ? qrVerifiedObservations30d / observations30d : null,
      roomId: room.id,
      freshSeatCoverage,
      activeCheckIns: Number(activeCheckIns?.value ?? 0),
      observationsLast24h: Number(observations24h?.value ?? 0),
      checkInsLast24h: Number(checkIns24h?.value ?? 0),
    };
  }

  /** Last 30 closed days written by the daily reset job, oldest first. */
  private async dailyStats(roomId: string): Promise<RoomDailyStatDto[]> {
    const rows = await this.db
      .select()
      .from(schema.roomDailyStats)
      .where(eq(schema.roomDailyStats.roomId, roomId))
      .orderBy(desc(schema.roomDailyStats.day))
      .limit(30);
    return rows
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({ day: r.day, freshSeatCoverage: r.freshSeatCoverage, checkIns: r.checkIns, observations: r.observations, activeUsers: r.activeUsers }));
  }

  /**
   * Active / returning users over 7 and 30 days. Check-ins and observations in the last 30 days are grouped
   * per (user, UTC hour); the Buenos Aires day of each bucket is computed in JS (the zone has whole-hour
   * offsets, so an hour never straddles two local days) and the windows are folded in memory. Buckets are
   * bounded by users x 30 x 24.
   */
  private async usageMetrics(
    roomId: string,
    now: Date,
  ): Promise<Pick<RoomStatsDto, "activeUsers7d" | "activeUsers30d" | "returningUsers7d" | "returningUsers30d">> {
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since7 = new Date(now.getTime() - 7 * DAY_MS);

    const checkInRows = await this.db
      .select({ userId: schema.checkIns.userId, at: sql<number>`max(${schema.checkIns.createdAt})`.mapWith(Number) })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.createdAt, since30)))
      .groupBy(schema.checkIns.userId, sql`${schema.checkIns.createdAt} / ${HOUR_MS}`);
    const observationRows = await this.db
      .select({ userId: schema.seatObservations.userId, at: sql<number>`max(${schema.seatObservations.createdAt})`.mapWith(Number) })
      .from(schema.seatObservations)
      .where(
        and(
          eq(schema.seatObservations.roomId, roomId),
          eq(schema.seatObservations.adminOverride, false),
          gte(schema.seatObservations.createdAt, since30),
        ),
      )
      .groupBy(schema.seatObservations.userId, sql`${schema.seatObservations.createdAt} / ${HOUR_MS}`);
    const rows = [...checkInRows, ...observationRows];

    const fold = (from: Date) => {
      const daysByUser = new Map<string, Set<string>>();
      for (const r of rows) {
        if (r.at < from.getTime()) continue;
        const set = daysByUser.get(r.userId) ?? new Set<string>();
        set.add(baDay(r.at));
        daysByUser.set(r.userId, set);
      }
      return { active: daysByUser.size, returning: [...daysByUser.values()].filter((d) => d.size >= 2).length };
    };
    const w7 = fold(since7);
    const w30 = fold(since30);
    return { activeUsers7d: w7.active, activeUsers30d: w30.active, returningUsers7d: w7.returning, returningUsers30d: w30.returning };
  }

  async getGeofence(idOrSlug: string): Promise<RoomGeofenceDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    return {
      latitude: room.latitude,
      longitude: room.longitude,
      radiusM: room.geofenceRadiusM,
      maxAccuracyM: env.presenceMaxAccuracyM,
    };
  }

  /** Dry-runs `PresenceService.validate` against the room's current geofence, for the calibration UI. */
  async testGeofence(idOrSlug: string, location: LocationInput): Promise<GeofenceTestResultDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const result = this.presence.validate(room, location, { isProduction: true });

    const details =
      result.details ??
      (() => {
        const distanceM = this.presence.haversineDistanceM(room, location);
        const allowedM = room.geofenceRadiusM + Math.min(location.accuracy, env.presenceMaxAccuracyM) / 2;
        return { distanceM: Math.round(distanceM), accuracyM: Math.round(location.accuracy), radiusM: room.geofenceRadiusM, allowedM: Math.round(allowedM) };
      })();

    return {
      distanceM: details.distanceM,
      accuracyM: details.accuracyM,
      allowedM: details.allowedM,
      valid: result.valid,
      reason: result.reason,
    };
  }

  /** Updates the room's calibrated geofence center/radius, auditing the change via `moderation_actions`. */
  async updateGeofence(idOrSlug: string, actorId: string, next: { latitude: number; longitude: number; radiusM: number }): Promise<RoomGeofenceDto> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const old = { latitude: room.latitude, longitude: room.longitude, radiusM: room.geofenceRadiusM };

    this.db.transaction((tx) => {
      tx.update(schema.rooms)
        .set({ latitude: next.latitude, longitude: next.longitude, geofenceRadiusM: next.radiusM, updatedAt: new Date() })
        .where(eq(schema.rooms.id, room.id))
        .run();
      tx.insert(schema.moderationActions)
        .values({
          actorId,
          targetUserId: null,
          action: "ROOM_GEOFENCE_UPDATED",
          metadata: { roomId: room.id, old, next },
        })
        .run();
    });
    // The geofence is cached for presence checks — drop it so the new one applies immediately.
    this.roomCache.invalidate(room.id);

    return { latitude: next.latitude, longitude: next.longitude, radiusM: next.radiusM, maxAccuracyM: env.presenceMaxAccuracyM };
  }

  /**
   * Marks every active seat that is not currently OCCUPIED (FREE / UNKNOWN / UNCERTAIN) as OCCUPIED for
   * `minutes`, via one admin-attributed `admin_override` observation per seat. Seats with an active
   * check-in are never touched (they are OCCUPIED already and outrank observations). No presence check.
   */
  async markAllOccupied(
    idOrSlug: string,
    actorId: string,
    minutes: number,
  ): Promise<{ roomId: string; count: number; expiresAt: Date; changes: SeatStateChange[] }> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60_000);

    // The derived seat states are read first (async); the active check-ins are re-read inside the transaction.
    const live = await this.roomState.getLiveSeatStates(room.id, now);

    const { count: marked, changes } = this.db.transaction((tx) => {
      const seated = new Set(
        tx
          .select({ seatId: schema.checkIns.seatId })
          .from(schema.checkIns)
          .where(and(eq(schema.checkIns.roomId, room.id), eq(schema.checkIns.status, "ACTIVE")))
          .all()
          .map((c) => c.seatId),
      );
      const targets = [...live.values()].filter((s) => s.status !== "OCCUPIED" && !seated.has(s.seatId)).map((s) => s.seatId);

      for (const part of chunk(targets, rowsPerInsert(OBSERVATION_COLUMN_COUNT))) {
        tx.insert(schema.seatObservations)
          .values(
            part.map((seatId) => ({
              userId: actorId,
              roomId: room.id,
              seatId,
              observedStatus: "OCCUPIED" as const,
              presenceVerified: false,
              adminOverride: true,
              confidenceWeight: ADMIN_OVERRIDE_WEIGHT,
              observedAt: now,
              expiresAt,
            })),
          )
          .run();
      }
      const changes = this.roomState.recomputeSeats(targets, { roomId: room.id, now, eventType: "ADMIN_MARK_ALL_OCCUPIED", actingUserId: actorId, tx });
      tx.insert(schema.moderationActions)
        .values({
          actorId,
          targetUserId: null,
          action: "ADMIN_MARK_ALL_OCCUPIED",
          metadata: { roomId: room.id, count: targets.length, minutes },
        })
        .run();
      return { count: targets.length, changes };
    });

    return { roomId: room.id, count: marked, expiresAt, changes };
  }

  /** Expires every live admin bulk-mark in the room and recomputes the affected seats. */
  async undoMarkAllOccupied(idOrSlug: string, actorId: string): Promise<{ roomId: string; count: number; changes: SeatStateChange[] }> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const now = new Date();

    const result = this.db.transaction((tx) => {
      const expired = tx
        .update(schema.seatObservations)
        .set({ expiresAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.seatObservations.roomId, room.id),
            eq(schema.seatObservations.adminOverride, true),
            gt(schema.seatObservations.expiresAt, now),
          ),
        )
        .returning({ seatId: schema.seatObservations.seatId })
        .all();
      const seatIds = [...new Set(expired.map((r) => r.seatId))];
      const changes = this.roomState.recomputeSeats(seatIds, {
        roomId: room.id,
        now,
        eventType: "ADMIN_MARK_ALL_OCCUPIED_UNDO",
        actingUserId: actorId,
        tx,
      });
      tx.insert(schema.moderationActions)
        .values({
          actorId,
          targetUserId: null,
          action: "ADMIN_MARK_ALL_OCCUPIED_UNDO",
          metadata: { roomId: room.id, count: seatIds.length },
        })
        .run();
      return { count: seatIds.length, changes };
    });

    return { roomId: room.id, ...result };
  }
}
