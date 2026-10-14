import { and, eq, gte } from "drizzle-orm";
import { schema, type Db, type Tx } from "@sala/database";
import type { StudyStatusDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import type { RestrictionService } from "../users/restriction.service.js";
import { containsProfanity } from "../table-names/profanity.js";

const RECENT_PRESENCE_WINDOW_MIN = 60;
/** Same link filter as table names: this text is public on the room people list and profiles. */
const URL_PATTERN = /https?:\/\/|www\.|\.(com|net|org|ar|io|co|info|xyz|gov|edu)\b/i;

export interface StartStudyInput {
  subject?: string;
  message?: string;
  lookingForGroup: boolean;
}

/** Study Mode ("Modo Estudio"): a lightweight status row users toggle on top of their check-in. */
export class StudyService {
  constructor(
    private readonly db: Db,
    private readonly restrictions: RestrictionService,
  ) {}

  /** Throws `PRESENCE_REJECTED` unless the user has an active check-in in `roomId`, or started one there in the last hour. */
  async assertRecentPresence(userId: string, roomId: string): Promise<void> {
    this.assertRecentPresenceSync(this.db, userId, roomId);
  }

  private assertRecentPresenceSync(db: Db | Tx, userId: string, roomId: string): void {
    const activeCheckIn = db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE")))
      .limit(1)
      .get();
    if (activeCheckIn) return;

    const windowStart = new Date(Date.now() - RECENT_PRESENCE_WINDOW_MIN * 60_000);
    const recentCheckIn = db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.roomId, roomId), gte(schema.checkIns.startedAt, windowStart)))
      .limit(1)
      .get();
    if (recentCheckIn) return;

    throw ApiErrors.presenceRejected(
      "OUTSIDE_GEOFENCE",
      "Necesitás tener un check-in activo (o haber hecho uno hace poco) para iniciar el Modo Estudio.",
    );
  }

  async start(userId: string, roomId: string, input: StartStudyInput): Promise<StudyStatusDto> {
    await this.restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);
    for (const text of [input.subject, input.message]) {
      if (!text) continue;
      if (URL_PATTERN.test(text)) throw ApiErrors.validation("El estado no puede contener enlaces.");
      if (containsProfanity(text)) throw ApiErrors.validation("Ese texto no está permitido.");
    }

    const now = new Date();
    const subject = input.subject ?? null;
    const message = input.message ?? null;

    // Presence check, read of the current row and upsert are one sync transaction.
    const startedAt = this.db.transaction((tx) => {
      this.assertRecentPresenceSync(tx, userId, roomId);

      const existing = tx
        .select()
        .from(schema.studyStatus)
        .where(and(eq(schema.studyStatus.userId, userId), eq(schema.studyStatus.roomId, roomId)))
        .limit(1)
        .get();

      // Re-starting while already active keeps the original `startedAt` (it isn't a new session).
      const effectiveStart = existing?.active ? existing.startedAt : now;

      tx.insert(schema.studyStatus)
        .values({ userId, roomId, subject, message, lookingForGroup: input.lookingForGroup, active: true, startedAt: effectiveStart, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.studyStatus.userId, schema.studyStatus.roomId],
          set: { subject, message, lookingForGroup: input.lookingForGroup, active: true, startedAt: effectiveStart, updatedAt: now },
        })
        .run();
      return effectiveStart;
    });

    return { subject, message, lookingForGroup: input.lookingForGroup, startedAt: startedAt.toISOString() };
  }

  /** Deactivates the caller's active study status, in whichever room it's active (there's at most one). */
  async stop(userId: string): Promise<void> {
    this.db
      .update(schema.studyStatus)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(schema.studyStatus.userId, userId), eq(schema.studyStatus.active, true)))
      .run();
  }

  /** Any room's active study status for this user — used by public profiles (one room in this MVP). */
  async getActiveStatusForUser(userId: string): Promise<StudyStatusDto | null> {
    const row = this.db
      .select()
      .from(schema.studyStatus)
      .where(and(eq(schema.studyStatus.userId, userId), eq(schema.studyStatus.active, true)))
      .limit(1)
      .get();
    return row ? toStudyStatusDto(row) : null;
  }
}

export function toStudyStatusDto(row: typeof schema.studyStatus.$inferSelect): StudyStatusDto {
  return { subject: row.subject, message: row.message, lookingForGroup: row.lookingForGroup, startedAt: row.startedAt.toISOString() };
}
