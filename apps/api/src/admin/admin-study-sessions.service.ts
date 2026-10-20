import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import type { z } from "zod";
import { schema, type Db } from "@sala/database";
import type { manualStudySessionSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { RolesService } from "../users/roles.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { MAX_VERIFIED_MINUTES, StudySessionService } from "../rankings/study-session.service.js";

/** Upper bound of one admin credit; only stops absurd typos (about 2 years of time). */
const MAX_CREDIT_MINUTES = 1_000_000;

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
 * past counting bug), any bonus time the admin decides on, or time taken away (negative minutes). Stored as a `MANUAL` session so rankings and streaks pick it up like any other,
 * and audited in `moderation_actions`.
 */
export class AdminStudySessionsService {
  constructor(
    private readonly db: Db,
    private readonly roles: RolesService,
    private readonly rooms: RoomsService,
    private readonly studySessions: StudySessionService,
  ) {}

  async credit(actorId: string, input: z.infer<typeof manualStudySessionSchema>, now: Date = new Date()): Promise<ManualStudySessionDto> {
    // Only the app owner adds or takes away study time; other admins cannot (route also behind AdminOnlyGuard).
    if (!(await this.roles.isOwner(actorId))) throw ApiErrors.forbidden("Solo el dueño de la app puede sumar o sacar horas de estudio.");

    const startedAt = new Date(input.startedAt);
    const minutes = input.minutes ?? Math.floor((new Date(input.endedAt!).getTime() - startedAt.getTime()) / 60_000);
    // Negative minutes (only through `minutes`) take time away; an endedAt range is always a positive stay.
    const removal = input.minutes !== undefined && input.minutes < 0;
    if (minutes === 0 || (!removal && minutes < 1)) throw ApiErrors.validation("La sesión tiene que durar al menos 1 minuto.");
    if (Math.abs(minutes) > MAX_CREDIT_MINUTES) throw ApiErrors.validation(`No se pueden sumar ni sacar más de ${MAX_CREDIT_MINUTES} minutos de una vez.`);
    if (startedAt.getTime() > now.getTime()) throw ApiErrors.validation("La fecha no puede estar en el futuro.");
    const endedAt = new Date(startedAt.getTime() + Math.max(0, minutes) * 60_000);
    // A removal is a correction on its start day: no overlap or end checks. Up to 12 h it is a real stay that got lost: it must end before now and not overlap time already
    // counted. Longer credits are a bonus the admin decides on; they count whole on their start day.
    const realStay = !removal && minutes <= MAX_VERIFIED_MINUTES;
    if (realStay && endedAt.getTime() > now.getTime()) throw ApiErrors.validation("La sesión no puede terminar en el futuro.");

    const [target] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, input.userId)).limit(1);
    if (!target) throw ApiErrors.notFound("Usuario no encontrado.");

    const roomId = input.roomId ? (await this.rooms.findRoomRow(input.roomId)).id : await this.defaultRoomId(input.userId);

    return this.db.transaction((tx) => {
      // Never credit time the user already has counted (a recorded session or a live check-in), or
      // the same minutes would add up twice.
      const nearby = tx
        .select({ startedAt: schema.studySessions.startedAt, minutes: schema.studySessions.verifiedMinutes })
        .from(schema.studySessions)
        .where(
          and(
            eq(schema.studySessions.userId, input.userId),
            lt(schema.studySessions.startedAt, endedAt),
            gt(schema.studySessions.startedAt, new Date(startedAt.getTime() - MAX_VERIFIED_MINUTES * 60_000)),
          ),
        )
        .all();
      // Bonus credits (over 12 h) never block a real stay: they are not spread over clock time.
      const overlapsSession = nearby.some(
        (s) => s.minutes > 0 && s.minutes <= MAX_VERIFIED_MINUTES && s.startedAt.getTime() + s.minutes * 60_000 > startedAt.getTime(),
      );
      const active = tx
        .select({ id: schema.checkIns.id })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.userId, input.userId), eq(schema.checkIns.status, "ACTIVE"), lt(schema.checkIns.startedAt, endedAt)))
        .limit(1)
        .get();
      if (realStay && (overlapsSession || active)) throw ApiErrors.validation("El usuario ya tiene tiempo de estudio registrado en ese horario.");

      const id = this.studySessions.recordManual(tx, { userId: input.userId, roomId, startedAt, minutes });
      tx.insert(schema.moderationActions)
        .values({
          actorId,
          targetUserId: input.userId,
          action: "STUDY_TIME_CREDITED",
          metadata: { sessionId: id, roomId, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), minutes, reason: input.reason },
        })
        .run();
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
