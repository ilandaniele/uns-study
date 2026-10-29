import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { seatCalibrationSchema, type RoomModeDto, type SeatCalibrationDto, type SeatCalibrationInput, type SimpleCheckInResult, type simpleCheckInRequestSchema } from "@sala/contracts";
import type { z } from "zod";
import { ApiErrors, ApiException } from "../common/api-error.js";
import type { RoomsService } from "../rooms/rooms.service.js";
import type { CheckInService } from "../checkins/checkins.service.js";
import type { PresenceGrant, PresenceService } from "../presence/presence.service.js";
import type { RolesService } from "../users/roles.service.js";
import { buildSeatProjection, seatLayoutHash, selectSimpleSeat } from "./seat-position.js";

export class SimpleRoomService {
  constructor(private readonly db: Db, private readonly rooms: RoomsService, private readonly checkIns: CheckInService, private readonly presence: PresenceService, private readonly roles: RolesService) {}

  mode(userId: string): RoomModeDto {
    const row = this.db.select().from(schema.userRoomPreferences).where(eq(schema.userRoomPreferences.userId, userId)).get();
    return { mode: row?.mode ?? "COMMON" };
  }

  setMode(userId: string, input: RoomModeDto): RoomModeDto {
    this.db.insert(schema.userRoomPreferences).values({ userId, mode: input.mode }).onConflictDoUpdate({ target: schema.userRoomPreferences.userId, set: { mode: input.mode, updatedAt: new Date() } }).run();
    return { mode: input.mode };
  }

  async calibration(adminId: string, roomSlug: string): Promise<SeatCalibrationDto> {
    if (!(await this.roles.isSuperAdmin(adminId))) throw ApiErrors.forbidden();
    const map = await this.rooms.getRoomMap(roomSlug);
    const row = this.db.select().from(schema.roomSeatCalibrations).where(eq(schema.roomSeatCalibrations.roomId, map.room.id)).get();
    if (!row) return { calibration: null, matchesLayout: false, updatedAt: null, positions: [] };
    const valid = row.layoutHash === await seatLayoutHash(map.seats);
    const projection = valid ? buildSeatProjection(row.calibration, map.seats) : null;
    return { calibration: row.calibration, matchesLayout: valid, updatedAt: row.updatedAt.toISOString(), positions: projection ? map.seats.map(s => ({ seatId: s.id, ...projection.geographic(s) })) : [] };
  }

  async saveCalibration(adminId: string, slug: string, input: SeatCalibrationInput): Promise<SeatCalibrationDto> {
    if (!(await this.roles.isSuperAdmin(adminId))) throw ApiErrors.forbidden();
    const room = await this.rooms.findRoomRow(slug), map = await this.rooms.getRoomMap(slug);
    try { buildSeatProjection(input, map.seats); } catch (error) { throw ApiErrors.validation(error instanceof Error ? error.message : "Revisá las referencias."); }
    for (const anchor of input.anchors) if (this.presence.haversineDistanceM(room, anchor) > room.geofenceRadiusM) throw ApiErrors.validation("Las referencias deben quedar dentro del radio de la sala.");
    const layoutHash = await seatLayoutHash(map.seats);
    this.db.transaction(tx => {
      tx.insert(schema.roomSeatCalibrations).values({ roomId: room.id, calibration: input, layoutHash }).onConflictDoUpdate({ target: schema.roomSeatCalibrations.roomId, set: { calibration: input, layoutHash, updatedAt: new Date() } }).run();
      tx.insert(schema.securityEvents).values({ userId: adminId, eventType: "ROOM_SEAT_CALIBRATION_UPDATED", metadata: { roomId: room.id } }).run();
    });
    return this.calibration(adminId, slug);
  }

  async clearCalibration(adminId: string, slug: string): Promise<void> {
    if (!(await this.roles.isSuperAdmin(adminId))) throw ApiErrors.forbidden();
    const room = await this.rooms.findRoomRow(slug);
    this.db.transaction(tx => {
      tx.delete(schema.roomSeatCalibrations).where(eq(schema.roomSeatCalibrations.roomId, room.id)).run();
      tx.insert(schema.securityEvents).values({ userId: adminId, eventType: "ROOM_SEAT_CALIBRATION_REMOVED", metadata: { roomId: room.id } }).run();
    });
  }

  async attempt(userId: string, input: z.infer<typeof simpleCheckInRequestSchema>, presence: PresenceGrant): Promise<{ result: SimpleCheckInResult; write: Awaited<ReturnType<CheckInService["checkIn"]>> | null }> {
    const active = await this.checkIns.getActiveCheckIn(userId);
    if (active) return { result: { outcome: "ALREADY_CHECKED_IN", checkIn: active }, write: null };
    const map = await this.rooms.getRoomMap(input.roomId);
    let seatId = input.confirmedSeatId;
    let guard: ((tx: Db) => boolean) | undefined;
    if (!seatId) {
      const row = this.db.select().from(schema.roomSeatCalibrations).where(eq(schema.roomSeatCalibrations.roomId, map.room.id)).get();
      const uncalibrated = (reason: "CALIBRATION_REQUIRED" | "LAYOUT_CHANGED") => ({ result: { outcome: "CONFIRM" as const, reason, suggestedSeatId: null, candidateSeatIds: [], accuracyM: input.location.accuracy }, write: null });
      if (!row) return uncalibrated("CALIBRATION_REQUIRED");
      if (!seatCalibrationSchema.safeParse(row.calibration).success || row.layoutHash !== await seatLayoutHash(map.seats)) return uncalibrated("LAYOUT_CHANGED");
      const decision = selectSimpleSeat(input.location, row.calibration, map.seats);
      if ("outcome" in decision) return { result: decision, write: null };
      seatId = decision.seatId;
      guard = tx => {
        const current = tx.select().from(schema.roomSeatCalibrations).where(eq(schema.roomSeatCalibrations.roomId, map.room.id)).get();
        if (!current || current.layoutHash !== row.layoutHash || JSON.stringify(current.calibration) !== JSON.stringify(row.calibration)) return false;
        const seats = tx.select({ id: schema.seats.id, x: schema.seats.x, y: schema.seats.y }).from(schema.seats).where(and(eq(schema.seats.roomId, map.room.id), eq(schema.seats.active, true))).all();
        const expected = new Map(map.seats.map(s => [s.id, s]));
        return seats.length === expected.size && seats.every(s => expected.get(s.id)?.x === s.x && expected.get(s.id)?.y === s.y);
      };
    }
    try {
      const write = await this.checkIns.checkIn({ userId, roomId: input.roomId, seatId, location: input.location, presence, showIdentity: input.showIdentity, simpleMode: { automatic: !input.confirmedSeatId, guard } });
      return { result: { outcome: "CHECKED_IN", checkIn: write.checkIn }, write };
    } catch (error) {
      // A concurrent check-in or report may win after selection. Never silently pick another chair.
      if (error instanceof ApiException && error.code === "SEAT_TAKEN") {
        const active = await this.checkIns.getActiveCheckIn(userId);
        return { result: active ? { outcome: "ALREADY_CHECKED_IN", checkIn: active } : { outcome: "CONFIRM", reason: "NEAREST_UNAVAILABLE", suggestedSeatId: null, candidateSeatIds: [], accuracyM: input.location.accuracy }, write: null };
      }
      throw error;
    }
  }
}
