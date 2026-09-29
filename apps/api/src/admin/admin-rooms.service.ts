import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gt, gte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { GeofenceTestResultDto, LocationInput, RoomGeofenceDto, RoomStatsDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomCache } from "../common/cache/room-cache.service.js";

const HOURS_24_MS = 24 * 60 * 60 * 1000;
/** Far above any user's reputation weight, so an admin mark wins the weighted-conflict rule against user FREE observations. */
const ADMIN_OVERRIDE_WEIGHT = 1000;

export interface AdminOccupantDto {
  seatId: string;
  seatCode: string;
  userId: string;
  name: string;
  email: string;
}

@Injectable()
export class AdminRoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(RoomCache) private readonly roomCache: RoomCache = new RoomCache(),
  ) {}

  /** Room map plus occupants with real identities (no privacy filtering — admin only). */
  async live(idOrSlug: string) {
    const map = await this.rooms.getRoomMap(idOrSlug);
    const occupantRows = await this.db
      .select({ seatId: schema.checkIns.seatId, seatCode: schema.seats.code, userId: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .innerJoin(schema.user, eq(schema.user.id, schema.checkIns.userId))
      .where(and(eq(schema.checkIns.roomId, map.room.id), eq(schema.checkIns.status, "ACTIVE")));

    const occupants: AdminOccupantDto[] = occupantRows.map((r) => ({ seatId: r.seatId, seatCode: r.seatCode, userId: r.userId, name: r.name, email: r.email }));
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

    return {
      roomId: room.id,
      freshSeatCoverage,
      activeCheckIns: Number(activeCheckIns?.value ?? 0),
      observationsLast24h: Number(observations24h?.value ?? 0),
      checkInsLast24h: Number(checkIns24h?.value ?? 0),
    };
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

    await this.db
      .update(schema.rooms)
      .set({ latitude: next.latitude, longitude: next.longitude, geofenceRadiusM: next.radiusM, updatedAt: new Date() })
      .where(eq(schema.rooms.id, room.id));
    // The geofence is cached for presence checks — drop it so the new one applies immediately.
    this.roomCache.invalidate(room.id);

    await this.db.insert(schema.moderationActions).values({
      actorId,
      targetUserId: null,
      action: "ROOM_GEOFENCE_UPDATED",
      metadata: { roomId: room.id, old, next },
    });

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

    // Read before opening the transaction (a query outside it would queue behind it on a single connection).
    const [live, checkedIn] = await Promise.all([
      this.roomState.getLiveSeatStates(room.id, now),
      this.db
        .select({ seatId: schema.checkIns.seatId })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.roomId, room.id), eq(schema.checkIns.status, "ACTIVE"))),
    ]);
    const seated = new Set(checkedIn.map((c) => c.seatId));
    const targets = [...live.values()].filter((s) => s.status !== "OCCUPIED" && !seated.has(s.seatId)).map((s) => s.seatId);

    const { count: marked, changes } = await this.db.transaction(async (tx) => {
      if (targets.length > 0) {
        await tx.insert(schema.seatObservations).values(
          targets.map((seatId) => ({
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
        );
      }
      const changes = await this.roomState.recomputeSeats(targets, { roomId: room.id, now, eventType: "ADMIN_MARK_ALL_OCCUPIED", actingUserId: actorId, tx });
      await tx.insert(schema.moderationActions).values({
        actorId,
        targetUserId: null,
        action: "ADMIN_MARK_ALL_OCCUPIED",
        metadata: { roomId: room.id, count: targets.length, minutes },
      });
      return { count: targets.length, changes };
    });

    return { roomId: room.id, count: marked, expiresAt, changes };
  }

  /** Expires every live admin bulk-mark in the room and recomputes the affected seats. */
  async undoMarkAllOccupied(idOrSlug: string, actorId: string): Promise<{ roomId: string; count: number; changes: SeatStateChange[] }> {
    const room = await this.rooms.findRoomRow(idOrSlug);
    const now = new Date();

    const result = await this.db.transaction(async (tx) => {
      const expired = await tx
        .update(schema.seatObservations)
        .set({ expiresAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.seatObservations.roomId, room.id),
            eq(schema.seatObservations.adminOverride, true),
            gt(schema.seatObservations.expiresAt, now),
          ),
        )
        .returning({ seatId: schema.seatObservations.seatId });
      const seatIds = [...new Set(expired.map((r) => r.seatId))];
      const changes = await this.roomState.recomputeSeats(seatIds, {
        roomId: room.id,
        now,
        eventType: "ADMIN_MARK_ALL_OCCUPIED_UNDO",
        actingUserId: actorId,
        tx,
      });
      await tx.insert(schema.moderationActions).values({
        actorId,
        targetUserId: null,
        action: "ADMIN_MARK_ALL_OCCUPIED_UNDO",
        metadata: { roomId: room.id, count: seatIds.length },
      });
      return { count: seatIds.length, changes };
    });

    return { roomId: room.id, ...result };
  }
}
