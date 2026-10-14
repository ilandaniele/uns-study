import { Logger } from "../platform/logger.js";

const logger = new Logger("Alarm");

/** The slice of `DurableObjectStorage` the alarm helpers touch. */
export interface AlarmStorage {
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
}

/** A pending alarm this far in the past is considered lost (the platform normally fires it within seconds). */
export const ALARM_OVERDUE_GRACE_MS = 5_000;

/** Moves the alarm earlier to `next` (never later: an earlier pending alarm already covers it). */
export async function rearmIfEarlier(storage: AlarmStorage, next: Date | null): Promise<void> {
  if (!next) return;
  const current = await storage.getAlarm();
  if (current === null || next.getTime() < current) await storage.setAlarm(next.getTime());
}

/** Sets the alarm to exactly `next` (used after a run, when the old alarm has just fired). */
export async function armAlarm(storage: AlarmStorage, next: Date | null): Promise<void> {
  if (next) await storage.setAlarm(next.getTime());
}

/** Fire-and-forget wrapper for the synchronous scheduler callback. */
export function rearmInBackground(storage: AlarmStorage, next: Date | null): void {
  rearmIfEarlier(storage, next).catch((err) => logger.error("Failed to re-arm alarm", err instanceof Error ? err.stack : String(err)));
}

/** Cron safety net: run the scheduler when no alarm is pending or the pending one is overdue. */
export function shouldRunOnTick(currentAlarm: number | null, now: number): boolean {
  return currentAlarm === null || currentAlarm + ALARM_OVERDUE_GRACE_MS < now;
}
