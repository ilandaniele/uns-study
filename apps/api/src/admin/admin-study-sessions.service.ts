import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import type { z } from "zod";
import { schema, type Db } from "@sala/database";
import type { manualStudySessionSchema } from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { RolesService } from "../users/roles.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { MAX_VERIFIED_MINUTES, StudySessionService } from "../rankings/study-session.service.js";

export interface ManualStudySessionDto {
  id: string;
  userId: string;
  roomId: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

/**
 * Admin credit of study time that really happened but never reached `study_sessions` (e.g. lost to a
 * past counting bug). Stored as a `MANUAL` session so rankings and streaks pick it up like any other,
 * and audited in `moderation_actions`.
 */
@Injectable()
export class AdminStudySessionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(StudySessionService) private readonly studySessions: StudySessionService,
  ) {}

  async credit(actorId: string, input: z.infer<typeof manualStudySessionSchema>, now: Date = new Date()): Promise<ManualStudySessionDto> {
    // The route is behind AdminOnlyGuard; re-checked here so the rule holds for any caller.
    if (!(await this.roles.hasRole(actorId, ["ADMIN"]))) throw ApiErrors.forbidden("Necesitás permisos de administrador para hacer esto.");

    const startedAt = new Date(input.startedAt);
    const minutes = input.minutes ?? Math.floor((new Date(input.endedAt!).getTime() - startedAt.getTime()) / 60_000);
    if (minutes < 1) throw ApiErrors.validation("La sesión tiene que durar al menos 1 minuto.");
    if (minutes > MAX_VERIFIED_MINUTES) throw ApiErrors.validation(`Una sesión no puede superar los ${MAX_VERIFIED_MINUTES} minutos.`);
    const endedAt = new Date(startedAt.getTime() + minutes * 60_000);
    if (endedAt.getTime() > now.getTime()) throw ApiErrors.validation("La sesión no puede terminar en el futuro.");

    const [target] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, input.userId)).limit(1);
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");

    const roomId = input.roomId ? (await this.rooms.findRoomRow(input.roomId)).id : await this.defaultRoomId(input.userId);

    return this.db.transaction(async (tx) => {
      // Never credit time the user already has counted (a recorded session or a live check-in), or
      // the same minutes would add up twice.
      const nearby = await tx
        .select({ startedAt: schema.studySessions.startedAt, minutes: schema.studySessions.verifiedMinutes })
        .from(schema.studySessions)
        .where(
          and(
            eq(schema.studySessions.userId, input.userId),
            lt(schema.studySessions.startedAt, endedAt),
            gt(schema.studySessions.startedAt, new Date(startedAt.getTime() - MAX_VERIFIED_MINUTES * 60_000)),
          ),
        );
      const overlapsSession = nearby.some((s) => s.startedAt.getTime() + s.minutes * 60_000 > startedAt.getTime());
      const [active] = await tx
        .select({ id: schema.checkIns.id })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.userId, input.userId), eq(schema.checkIns.status, "ACTIVE"), lt(schema.checkIns.startedAt, endedAt)))
        .limit(1);
      if (overlapsSession || active) throw ApiErrors.validation("El usuario ya tiene tiempo de estudio registrado en ese horario.");

      const id = await this.studySessions.recordManual(tx, { userId: input.userId, roomId, startedAt, minutes });
      await tx.insert(schema.moderationActions).values({
        actorId,
        targetUserId: input.userId,
        action: "STUDY_TIME_CREDITED",
        metadata: { sessionId: id, roomId, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), minutes, reason: input.reason },
      });
      return { id, userId: input.userId, roomId, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), minutes };
    });
  }

  /** The room of the user's latest check-in, or else the oldest active room. */
  private async defaultRoomId(userId: string): Promise<string> {
    const [last] = await this.db
      .select({ roomId: schema.checkIns.roomId })
      .from(schema.checkIns)
      .where(eq(schema.checkIns.userId, userId))
      .orderBy(desc(schema.checkIns.startedAt))
      .limit(1);
    if (last) return last.roomId;
    const [room] = await this.db.select({ id: schema.rooms.id }).from(schema.rooms).where(eq(schema.rooms.active, true)).orderBy(asc(schema.rooms.createdAt)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();
    return room.id;
  }
}
