import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { StudyStatusDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";

const RECENT_PRESENCE_WINDOW_MIN = 60;

export interface StartStudyInput {
  subject?: string;
  message?: string;
  lookingForGroup: boolean;
}

/** Study Mode ("Modo Estudio"): a lightweight status row users toggle on top of their check-in. */
@Injectable()
export class StudyService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Throws `PRESENCE_REJECTED` unless the user has an active check-in in `roomId`, or started one there in the last hour. */
  async assertRecentPresence(userId: string, roomId: string): Promise<void> {
    const [activeCheckIn] = await this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE")))
      .limit(1);
    if (activeCheckIn) return;

    const windowStart = new Date(Date.now() - RECENT_PRESENCE_WINDOW_MIN * 60_000);
    const [recentCheckIn] = await this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.startedAt, windowStart)))
      .limit(1);
    if (recentCheckIn) return;

    throw ApiErrors.presenceRejected(
      "OUTSIDE_GEOFENCE",
      "Necesitás tener un check-in activo (o haber hecho uno hace poco) para iniciar el Modo Estudio.",
    );
  }

  async start(userId: string, roomId: string, input: StartStudyInput): Promise<StudyStatusDto> {
    await this.assertRecentPresence(userId, roomId);

    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(schema.studyStatus)
      .where(and(eq(schema.studyStatus.userId, userId), eq(schema.studyStatus.roomId, roomId)))
      .limit(1);

    // Re-starting while already active keeps the original `startedAt` (it isn't a new session).
    const startedAt = existing?.active ? existing.startedAt : now;
    const subject = input.subject ?? null;
    const message = input.message ?? null;

    await this.db
      .insert(schema.studyStatus)
      .values({ userId, roomId, subject, message, lookingForGroup: input.lookingForGroup, active: true, startedAt, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.studyStatus.userId, schema.studyStatus.roomId],
        set: { subject, message, lookingForGroup: input.lookingForGroup, active: true, startedAt, updatedAt: now },
      });

    return { subject, message, lookingForGroup: input.lookingForGroup, startedAt: startedAt.toISOString() };
  }

  /** Deactivates the caller's active study status, in whichever room it's active (there's at most one). */
  async stop(userId: string): Promise<void> {
    await this.db
      .update(schema.studyStatus)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(schema.studyStatus.userId, userId), eq(schema.studyStatus.active, true)));
  }

  /** Any room's active study status for this user — used by public profiles (one room in this MVP). */
  async getActiveStatusForUser(userId: string): Promise<StudyStatusDto | null> {
    const [row] = await this.db
      .select()
      .from(schema.studyStatus)
      .where(and(eq(schema.studyStatus.userId, userId), eq(schema.studyStatus.active, true)))
      .limit(1);
    return row ? toStudyStatusDto(row) : null;
  }
}

export function toStudyStatusDto(row: typeof schema.studyStatus.$inferSelect): StudyStatusDto {
  return { subject: row.subject, message: row.message, lookingForGroup: row.lookingForGroup, startedAt: row.startedAt.toISOString() };
}
