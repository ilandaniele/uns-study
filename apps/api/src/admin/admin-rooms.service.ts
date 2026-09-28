import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { GeofenceTestResultDto, LocationInput, RoomGeofenceDto, RoomStatsDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { env } from "../env.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";

const HOURS_24_MS = 24 * 60 * 60 * 1000;

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

    await this.db.insert(schema.moderationActions).values({
      actorId,
      targetUserId: null,
      action: "ROOM_GEOFENCE_UPDATED",
      metadata: { roomId: room.id, old, next },
    });

    return { latitude: next.latitude, longitude: next.longitude, radiusM: next.radiusM, maxAccuracyM: env.presenceMaxAccuracyM };
  }
}
