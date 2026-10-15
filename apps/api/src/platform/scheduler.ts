import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { systemClock, type Clock } from "./clock.js";
import { Logger } from "./logger.js";

export type JobHandler = (ctx: { key: string; payload: unknown; now: Date }) => Promise<void> | void;

export interface Scheduler {
  /** One-shot. Replaces any job with the same key (due time and payload). */
  schedule(key: string, dueAt: Date, payload?: unknown): void;
  /** One-shot. No-op when a job with that key already exists. Returns true when it inserted. */
  scheduleIfAbsent(key: string, dueAt: Date, payload?: unknown): boolean;
  /** Recurring. Inserts if missing (first run at firstDueAt ?? now + intervalMs); otherwise only updates interval. */
  every(key: string, intervalMs: number, firstDueAt?: Date): void;
  cancel(key: string): void;
  has(key: string): boolean;
}

/**
 * Recurring jobs that `ensureRecurring()` keeps registered. Handlers are attached by `jobs/register-jobs.ts`.
 * Every handler is an idempotent sweep and seat state / disputes are also resolved lazily on read, so
 * one minute is enough. They run from the per-minute Cron Trigger (`AppDO.tick`), never from the alarm:
 * re-arming it every minute would cost a row written each time, which the DO Free plan caps per day.
 */
export const RECURRING_JOBS: ReadonlyArray<{ key: string; intervalMs: number }> = [
  { key: "daily-reset", intervalMs: 60_000 },
  { key: "expiration", intervalMs: 60_000 },
  { key: "checkin-expiry-reminder", intervalMs: 60_000 },
  { key: "dispute-resolution", intervalMs: 60_000 },
  { key: "attachment-sweep", intervalMs: 3_600_000 },
  { key: "email-send", intervalMs: 60_000 },
  { key: "realtime-session-sweep", intervalMs: 60_000 },
];

/** Cron fires a few seconds off the minute; a recurring job due this soon runs now instead of waiting a whole tick. */
export const RECURRING_SLACK_MS = 5_000;

const logger = new Logger("Scheduler");

/** Exact key first, then the prefix before the first ':'. */
function findHandler(handlers: Map<string, JobHandler>, key: string): JobHandler | undefined {
  const exact = handlers.get(key);
  if (exact) return exact;
  const colon = key.indexOf(":");
  return colon > 0 ? handlers.get(key.slice(0, colon)) : undefined;
}

async function runHandler(handlers: Map<string, JobHandler>, key: string, payload: unknown, now: Date): Promise<void> {
  const handler = findHandler(handlers, key);
  if (!handler) {
    logger.warn(`No handler registered for job ${key}`);
    return;
  }
  try {
    await handler({ key, payload, now });
  } catch (err) {
    logger.error(`Job failed: ${key}`, err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
}

/**
 * Runs one-shot jobs persisted in `scheduled_jobs` (armed on the single Durable Object alarm) and
 * recurring jobs kept in memory (driven by the Cron tick). Recurring jobs are re-registered on every boot, so persisting them only
 * cost a row written (plus its due_at index entry) on every run, which the DO Free plan caps per day.
 */
export class SqliteScheduler implements Scheduler {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly recurring = new Map<string, { dueAt: Date; intervalMs: number }>();
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly onNextDueChanged: (next: Date | null) => void,
  ) {}

  register(keyOrPrefix: string, handler: JobHandler): void {
    this.handlers.set(keyOrPrefix, handler);
  }

  schedule(key: string, dueAt: Date, payload?: unknown): void {
    const payloadValue = payload === undefined ? null : payload;
    this.db
      .insert(schema.scheduledJobs)
      .values({ key, dueAt, intervalMs: null, payload: payloadValue })
      .onConflictDoUpdate({
        target: schema.scheduledJobs.key,
        set: { dueAt, intervalMs: null, payload: payloadValue },
      })
      .run();
    this.notify();
  }

  scheduleIfAbsent(key: string, dueAt: Date, payload?: unknown): boolean {
    const inserted = this.db
      .insert(schema.scheduledJobs)
      .values({ key, dueAt, intervalMs: null, payload: payload === undefined ? null : payload })
      .onConflictDoNothing()
      .returning({ key: schema.scheduledJobs.key })
      .all();
    if (inserted.length === 0) return false;
    this.notify();
    return true;
  }

  every(key: string, intervalMs: number, firstDueAt?: Date): void {
    const existing = this.recurring.get(key);
    if (existing) {
      existing.intervalMs = intervalMs;
      return;
    }
    this.recurring.set(key, { dueAt: firstDueAt ?? new Date(this.clock.now().getTime() + intervalMs), intervalMs });
    this.notify();
  }

  cancel(key: string): void {
    this.recurring.delete(key);
    this.db.delete(schema.scheduledJobs).where(eq(schema.scheduledJobs.key, key)).run();
    this.notify();
  }

  has(key: string): boolean {
    if (this.recurring.has(key)) return true;
    return this.db.select({ key: schema.scheduledJobs.key }).from(schema.scheduledJobs).where(eq(schema.scheduledJobs.key, key)).limit(1).all().length > 0;
  }

  /**
   * Runs every job with due_at <= now, sequentially. A job is advanced (recurring) or deleted
   * (one-shot) BEFORE its handler runs, so a crash mid-handler never replays it and a handler may
   * re-schedule its own key. Handler errors are logged, not rethrown.
   */
  async runDue(now: Date = this.clock.now()): Promise<{ ran: string[] }> {
    if (this.running) return { ran: [] };
    this.running = true;
    const ran: string[] = [];
    try {
      const due = this.db
        .select({ key: schema.scheduledJobs.key, dueAt: schema.scheduledJobs.dueAt })
        .from(schema.scheduledJobs)
        .where(lte(schema.scheduledJobs.dueAt, now))
        .all();
      for (const [key, job] of this.recurring) if (job.dueAt.getTime() <= now.getTime() + RECURRING_SLACK_MS) due.push({ key, dueAt: job.dueAt });
      due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      for (const { key } of due) {
        const rec = this.recurring.get(key);
        if (rec) {
          // Re-check: an earlier handler in this pass may have cancelled it.
          if (rec.dueAt.getTime() > now.getTime() + RECURRING_SLACK_MS) continue;
          rec.dueAt = new Date(now.getTime() + rec.intervalMs);
          ran.push(key);
          await runHandler(this.handlers, key, null, now);
          continue;
        }
        // Re-read: an earlier handler in this pass may have cancelled or re-scheduled it.
        const job = this.db
          .select()
          .from(schema.scheduledJobs)
          .where(and(eq(schema.scheduledJobs.key, key), lte(schema.scheduledJobs.dueAt, now)))
          .get();
        if (!job) continue;
        if (job.intervalMs !== null) {
          this.db
            .update(schema.scheduledJobs)
            .set({ dueAt: new Date(now.getTime() + job.intervalMs) })
            .where(eq(schema.scheduledJobs.key, key))
            .run();
        } else {
          this.db.delete(schema.scheduledJobs).where(eq(schema.scheduledJobs.key, key)).run();
        }
        ran.push(key);
        await runHandler(this.handlers, key, job.payload ?? null, now);
      }
    } finally {
      this.running = false;
      this.notify();
    }
    return { ran };
  }

  /** Earliest SQL one-shot: the only thing the alarm is armed for. */
  nextOneShotDueAt(): Date | null {
    const row = this.db
      .select({ dueAt: schema.scheduledJobs.dueAt })
      .from(schema.scheduledJobs)
      .orderBy(asc(schema.scheduledJobs.dueAt))
      .limit(1)
      .get();
    return row?.dueAt ?? null;
  }

  nextDueAt(): Date | null {
    let next = this.nextOneShotDueAt();
    for (const job of this.recurring.values()) if (!next || job.dueAt < next) next = job.dueAt;
    return next;
  }

  /** Registers the recurring jobs from `RECURRING_JOBS`; idempotent. Drops recurring rows left in SQL by older versions. */
  ensureRecurring(): void {
    this.db.delete(schema.scheduledJobs).where(isNotNull(schema.scheduledJobs.intervalMs)).run();
    for (const job of RECURRING_JOBS) this.every(job.key, job.intervalMs);
  }

  private notify(): void {
    this.onNextDueChanged(this.nextOneShotDueAt());
  }
}

interface ManualJob {
  dueAt: Date;
  intervalMs: number | null;
  payload: unknown;
}

/** In-memory scheduler for unit tests: nothing fires until the test calls `runDue(now)`. */
export class ManualScheduler implements Scheduler {
  private readonly jobs = new Map<string, ManualJob>();
  private readonly handlers = new Map<string, JobHandler>();
  private running = false;

  constructor(private readonly clock: Clock = systemClock) {}

  register(keyOrPrefix: string, handler: JobHandler): void {
    this.handlers.set(keyOrPrefix, handler);
  }

  schedule(key: string, dueAt: Date, payload?: unknown): void {
    this.jobs.set(key, { dueAt, intervalMs: null, payload: payload === undefined ? null : payload });
  }

  scheduleIfAbsent(key: string, dueAt: Date, payload?: unknown): boolean {
    if (this.jobs.has(key)) return false;
    this.schedule(key, dueAt, payload);
    return true;
  }

  every(key: string, intervalMs: number, firstDueAt?: Date): void {
    const existing = this.jobs.get(key);
    if (existing) {
      existing.intervalMs = intervalMs;
      return;
    }
    this.jobs.set(key, { dueAt: firstDueAt ?? new Date(this.clock.now().getTime() + intervalMs), intervalMs, payload: null });
  }

  cancel(key: string): void {
    this.jobs.delete(key);
  }

  has(key: string): boolean {
    return this.jobs.has(key);
  }

  /** Test helper: the pending job for `key` (due time and payload), if any. */
  get(key: string): { dueAt: Date; payload: unknown } | undefined {
    const job = this.jobs.get(key);
    return job ? { dueAt: job.dueAt, payload: job.payload } : undefined;
  }

  nextDueAt(): Date | null {
    let next: Date | null = null;
    for (const job of this.jobs.values()) if (!next || job.dueAt < next) next = job.dueAt;
    return next;
  }

  async runDue(now: Date = this.clock.now()): Promise<{ ran: string[] }> {
    if (this.running) return { ran: [] };
    this.running = true;
    const ran: string[] = [];
    try {
      const due = [...this.jobs.entries()]
        .filter(([, j]) => j.dueAt <= now)
        .sort(([ka, a], [kb, b]) => a.dueAt.getTime() - b.dueAt.getTime() || (ka < kb ? -1 : 1));
      for (const [key] of due) {
        const job = this.jobs.get(key);
        if (!job || job.dueAt > now) continue;
        if (job.intervalMs !== null) job.dueAt = new Date(now.getTime() + job.intervalMs);
        else this.jobs.delete(key);
        ran.push(key);
        await runHandler(this.handlers, key, job.payload, now);
      }
    } finally {
      this.running = false;
    }
    return { ran };
  }
}
