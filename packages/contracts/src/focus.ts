import { z } from "zod";
import type { FocusSettings, FocusStats, TimerState } from "./focus-timer";

export interface FocusSnapshot { settings: FocusSettings; timer: TimerState; stats: FocusStats }
export interface FocusSyncDto { state: FocusSnapshot | null; version: number; serverNow: number }
const settings = z.object({
  focusMin: z.number().int().min(1).max(180), shortMin: z.number().int().min(1).max(60),
  longMin: z.number().int().min(1).max(90), rounds: z.number().int().min(1).max(12),
  autoStartBreaks: z.boolean(), autoStartFocus: z.boolean(),
}).strict();
const snapshot = z.object({
  settings,
  timer: z.object({ phase: z.enum(["focus", "short", "long"]), status: z.enum(["idle", "running", "paused"]),
    completedInSet: z.number().int().min(0).max(12), endsAt: z.number().finite().nonnegative().nullable(), remainingMs: z.number().finite().min(0).max(180 * 60000),
  }).strict(),
  stats: z.object({ days: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.object({
    sessions: z.number().int().min(0).max(100000), minutes: z.number().int().min(0).max(10000000),
  }).strict()).refine(days => Object.keys(days).length <= 120) }).strict(),
}).strict();
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("initialize"), state: snapshot }).strict(),
  z.object({ action: z.literal("start") }).strict(), z.object({ action: z.literal("pause") }).strict(),
  z.object({ action: z.literal("resetPhase") }).strict(), z.object({ action: z.literal("resetAll") }).strict(),
  z.object({ action: z.literal("skip") }).strict(), z.object({ action: z.literal("settle") }).strict(),
  z.object({ action: z.literal("selectPhase"), phase: z.enum(["focus", "short", "long"]) }).strict(),
  z.object({ action: z.literal("setSettings"), settings }).strict(),
]);
export type FocusCommand = z.infer<typeof action>;
export const focusCommandSchema = z.object({ version: z.number().int().nonnegative(), command: action }).strict();
export type FocusCommandRequest = z.infer<typeof focusCommandSchema>;
