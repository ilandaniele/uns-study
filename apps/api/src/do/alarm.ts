import { Logger } from "../platform/logger.js";

const logger = new Logger("Alarm");

/** The slice of `DurableObjectStorage` the alarm helpers touch. */
export interface AlarmStorage {
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

/** Moves the alarm earlier to `next` (never later: an earlier pending alarm already covers it). */
export async function rearmIfEarlier(storage: AlarmStorage, next: Date | null): Promise<void> {
  if (!next) return;
  const current = await storage.getAlarm();
  if (current === null || next.getTime() < current) await storage.setAlarm(next.getTime());
}

/**
 * Sets the alarm to exactly `next`, or clears it when no one-shot is pending. Skips the write when the alarm
 * already matches: every `setAlarm` is a row written, which the DO Free plan caps per day.
 */
export async function armAlarm(storage: AlarmStorage, next: Date | null): Promise<void> {
  const current = await storage.getAlarm();
  if (next === null) {
    if (current !== null) await storage.deleteAlarm();
    return;
  }
  if (current !== next.getTime()) await storage.setAlarm(next.getTime());
}

/** Fire-and-forget wrapper for the synchronous scheduler callback. */
export function rearmInBackground(storage: AlarmStorage, next: Date | null): void {
  rearmIfEarlier(storage, next).catch((err) => logger.error("Failed to re-arm alarm", err instanceof Error ? err.stack : String(err)));
}
