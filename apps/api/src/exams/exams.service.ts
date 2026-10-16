import { and, asc, eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { USER_EXAMS_MAX, type ExamDto, type ExamPatch, type ExamRequest, type ExamsDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { DEFAULT_TIMEZONE, localDateOf } from "../common/dates.js";
import { isMissingSchemaError, orDefault } from "../common/sqlite-errors.js";
import type { Clock } from "../platform/clock.js";
import { addDays } from "../study-history/streak.js";
import { loadStudyIntervals, minutesBetween, type StudyInterval } from "../study-history/study-intervals.js";
import { examPlan, isRealLocalDate } from "./exam-plan.js";

type ExamRow = typeof schema.userExams.$inferSelect;

/** Pro exam planner: upcoming exams with a countdown and a daily study plan. */
export class ExamsService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<ExamsDto> {
    const career = await this.career(userId);
    const rows = await orDefault(
      () =>
        this.db
          .select()
          .from(schema.userExams)
          .where(eq(schema.userExams.userId, userId))
          .orderBy(asc(schema.userExams.examDate), asc(schema.userExams.createdAt))
          .all(),
      [] as ExamRow[],
    );
    if (rows.length === 0) return { exams: [], career };
    const now = this.clock.now();
    const intervals = await this.intervalsSince(userId, rows, now);
    return { exams: rows.map((row) => this.toDto(row, intervals, now)), career };
  }

  async create(userId: string, input: ExamRequest): Promise<ExamDto> {
    const now = this.clock.now();
    this.assertDate(input.examDate);
    if (input.examDate < localDateOf(now, DEFAULT_TIMEZONE)) throw ApiErrors.validation("La fecha del examen ya pasó.");
    try {
      const row = this.db.transaction((tx) => {
        const count = tx.select({ id: schema.userExams.id }).from(schema.userExams).where(eq(schema.userExams.userId, userId)).all().length;
        if (count >= USER_EXAMS_MAX) throw ApiErrors.validation(`Máximo ${USER_EXAMS_MAX} exámenes.`);
        return tx
          .insert(schema.userExams)
          .values({ userId, subject: input.subject, examDate: input.examDate, targetHours: input.targetHours, createdAt: now })
          .returning()
          .get();
      });
      return this.toDto(row, [], now);
    } catch (err) {
      throw this.writeError(err);
    }
  }

  /** 404 if not the owner. */
  async update(userId: string, examId: string, patch: ExamPatch): Promise<ExamDto> {
    const now = this.clock.now();
    if (patch.examDate !== undefined) this.assertDate(patch.examDate);
    const set: Partial<Pick<ExamRow, "subject" | "examDate" | "targetHours">> = {};
    if (patch.subject !== undefined) set.subject = patch.subject;
    if (patch.examDate !== undefined) set.examDate = patch.examDate;
    if (patch.targetHours !== undefined) set.targetHours = patch.targetHours;
    let row: ExamRow;
    try {
      const owner = and(eq(schema.userExams.id, examId), eq(schema.userExams.userId, userId));
      row = this.db.transaction((tx) => {
        const current = tx.select().from(schema.userExams).where(owner).get();
        if (!current) throw ApiErrors.notFound("Examen no encontrado.");
        // Skip the write when nothing actually changes (free-tier write cap).
        const changed = (Object.keys(set) as (keyof typeof set)[]).some((k) => set[k] !== current[k]);
        if (!changed) return current;
        return tx.update(schema.userExams).set(set).where(owner).returning().get() ?? current;
      });
    } catch (err) {
      throw this.writeError(err);
    }
    const intervals = await this.intervalsSince(userId, [row], now);
    return this.toDto(row, intervals, now);
  }

  /** 404 if not the owner. */
  async remove(userId: string, examId: string): Promise<void> {
    let deleted: { id: string }[];
    try {
      deleted = this.db
        .delete(schema.userExams)
        .where(and(eq(schema.userExams.id, examId), eq(schema.userExams.userId, userId)))
        .returning({ id: schema.userExams.id })
        .all();
    } catch (err) {
      throw this.writeError(err);
    }
    if (deleted.length === 0) throw ApiErrors.notFound("Examen no encontrado.");
  }

  private assertDate(value: string): void {
    if (!isRealLocalDate(value)) throw ApiErrors.validation("La fecha del examen no es válida.");
  }

  private writeError(err: unknown): unknown {
    return isMissingSchemaError(err) ? ApiErrors.featureDisabled() : err;
  }

  private async career(userId: string): Promise<string | null> {
    const row = this.db
      .select({ career: schema.userProfiles.career })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1)
      .get();
    const career = row?.career?.trim();
    return career ? career : null;
  }

  /** One load covering the earliest exam's `createdAt` (a day earlier, so local/UTC skew can't drop minutes). */
  private async intervalsSince(userId: string, rows: readonly ExamRow[], now: Date): Promise<StudyInterval[]> {
    const earliest = rows.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), rows[0]!.createdAt);
    return loadStudyIntervals(this.db, userId, addDays(localDateOf(earliest, DEFAULT_TIMEZONE), -1), now);
  }

  private toDto(row: ExamRow, intervals: readonly StudyInterval[], now: Date): ExamDto {
    const studiedMinutes = minutesBetween(intervals, row.createdAt, now);
    const plan = examPlan({
      targetHours: row.targetHours,
      studiedMinutes,
      today: localDateOf(now, DEFAULT_TIMEZONE),
      examDate: row.examDate,
    });
    return {
      id: row.id,
      subject: row.subject,
      examDate: row.examDate,
      targetHours: row.targetHours,
      createdAt: row.createdAt.toISOString(),
      studiedMinutes,
      ...plan,
    };
  }
}
