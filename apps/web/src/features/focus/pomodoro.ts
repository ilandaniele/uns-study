/**
 * Pure Pomodoro timer logic. No timers, no DOM: every function takes `now` (epoch ms) so the
 * countdown is computed from timestamps and never drifts, survives reloads and is testable.
 */

export type Phase = "focus" | "short" | "long";
export type Status = "idle" | "running" | "paused";

export interface FocusSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Focus blocks before a long break. */
  rounds: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export interface TimerState {
  phase: Phase;
  /** Focus blocks completed in the current set (0..rounds-1). */
  completedInSet: number;
  status: Status;
  /** Epoch ms when the running phase ends. Only meaningful while running. */
  endsAt: number | null;
  /** Remaining ms while idle or paused. */
  remainingMs: number;
}

export interface Preset {
  id: string;
  label: string;
  focusMin: number;
  shortMin: number;
  longMin: number;
}

export const PRESETS: Preset[] = [
  { id: "25-5", label: "25 / 5", focusMin: 25, shortMin: 5, longMin: 15 },
  { id: "30-5", label: "30 / 5", focusMin: 30, shortMin: 5, longMin: 15 },
  { id: "45-15", label: "45 / 15", focusMin: 45, shortMin: 15, longMin: 30 },
  { id: "50-10", label: "50 / 10", focusMin: 50, shortMin: 10, longMin: 30 },
];

export const DEFAULT_SETTINGS: FocusSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  rounds: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
};

export const LIMITS = {
  focusMin: [1, 180],
  shortMin: [1, 60],
  longMin: [1, 90],
  rounds: [1, 12],
} as const;

const MIN_MS = 60_000;

export function clampSetting(key: keyof typeof LIMITS, value: number): number {
  const [lo, hi] = LIMITS[key];
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(value)));
}

export function sanitizeSettings(raw: Partial<FocusSettings> | null | undefined): FocusSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    focusMin: clampSetting("focusMin", s.focusMin),
    shortMin: clampSetting("shortMin", s.shortMin),
    longMin: clampSetting("longMin", s.longMin),
    rounds: clampSetting("rounds", s.rounds),
    autoStartBreaks: Boolean(s.autoStartBreaks),
    autoStartFocus: Boolean(s.autoStartFocus),
  };
}

export function presetIdFor(s: FocusSettings): string | null {
  return PRESETS.find((p) => p.focusMin === s.focusMin && p.shortMin === s.shortMin && p.longMin === s.longMin)?.id ?? null;
}

export function phaseDurationMs(phase: Phase, s: FocusSettings): number {
  const min = phase === "focus" ? s.focusMin : phase === "short" ? s.shortMin : s.longMin;
  return min * MIN_MS;
}

export function initialState(s: FocusSettings): TimerState {
  return { phase: "focus", completedInSet: 0, status: "idle", endsAt: null, remainingMs: phaseDurationMs("focus", s) };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status === "running" && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  return state.remainingMs;
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status === "running") return state;
  return { ...state, status: "running", endsAt: now + state.remainingMs };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== "running") return state;
  return { ...state, status: "paused", endsAt: null, remainingMs: remainingMs(state, now) };
}

export function toggle(state: TimerState, now: number): TimerState {
  return state.status === "running" ? pause(state, now) : start(state, now);
}

/** Restarts the current phase from its full duration, stopped. */
export function resetPhase(state: TimerState, s: FocusSettings): TimerState {
  return { ...state, status: "idle", endsAt: null, remainingMs: phaseDurationMs(state.phase, s) };
}

/** Back to the first focus block of a fresh set. */
export function resetAll(s: FocusSettings): TimerState {
  return initialState(s);
}

/** Jumps to a phase manually (tabs). Stops the timer. */
export function selectPhase(state: TimerState, phase: Phase, s: FocusSettings): TimerState {
  return { ...state, phase, status: "idle", endsAt: null, remainingMs: phaseDurationMs(phase, s) };
}

/** Which phase follows `state.phase`, and the new set counter. */
export function nextPhase(state: TimerState, s: FocusSettings): { phase: Phase; completedInSet: number } {
  if (state.phase === "focus") {
    const done = state.completedInSet + 1;
    return done >= s.rounds ? { phase: "long", completedInSet: done } : { phase: "short", completedInSet: done };
  }
  // A long break closes the set.
  return { phase: "focus", completedInSet: state.phase === "long" ? 0 : state.completedInSet };
}

function shouldAutoStart(phase: Phase, s: FocusSettings): boolean {
  return phase === "focus" ? s.autoStartFocus : s.autoStartBreaks;
}

/**
 * Moves to the next phase. `at` is when the previous phase ended: an auto-started phase is
 * chained from that instant (not from `now`) so a late tick never stretches the schedule.
 */
export function advance(state: TimerState, s: FocusSettings, at: number): TimerState {
  const next = nextPhase(state, s);
  const duration = phaseDurationMs(next.phase, s);
  if (shouldAutoStart(next.phase, s)) {
    return { phase: next.phase, completedInSet: next.completedInSet, status: "running", endsAt: at + duration, remainingMs: duration };
  }
  return { phase: next.phase, completedInSet: next.completedInSet, status: "idle", endsAt: null, remainingMs: duration };
}

export interface Completion {
  phase: Phase;
  /** Epoch ms when that phase ended. */
  at: number;
  /** Minutes of focus credited (focus phases only). */
  focusMin: number;
}

export interface TickResult {
  state: TimerState;
  completed: Completion[];
}

/**
 * Settles every phase that ended by `now`. After a long sleep with auto-start on, several
 * phases may have ended; each is reported once so stats stay correct.
 */
export function tick(state: TimerState, s: FocusSettings, now: number): TickResult {
  const completed: Completion[] = [];
  let cur = state;
  // Bounded: a week away with 1-minute phases still terminates.
  for (let i = 0; i < 500 && cur.status === "running" && cur.endsAt !== null && cur.endsAt <= now; i++) {
    const at = cur.endsAt;
    completed.push({ phase: cur.phase, at, focusMin: cur.phase === "focus" ? Math.round(phaseDurationMs("focus", s) / MIN_MS) : 0 });
    cur = advance(cur, s, at);
  }
  return { state: cur, completed };
}

/** Skips the rest of the current phase without crediting it. A stopped timer stays stopped. */
export function skip(state: TimerState, s: FocusSettings, now: number): TimerState {
  const next = advance(state, s, now);
  if (state.status === "running" || next.status !== "running") return next;
  return { ...next, status: "idle", endsAt: null };
}

/** Keeps a paused/idle timer consistent after settings change; a running one keeps its end. */
export function applySettings(state: TimerState, s: FocusSettings): TimerState {
  const completedInSet = Math.min(state.completedInSet, s.rounds - 1);
  if (state.status === "idle") return { ...state, completedInSet, remainingMs: phaseDurationMs(state.phase, s) };
  if (state.status === "paused") return { ...state, completedInSet, remainingMs: Math.min(state.remainingMs, phaseDurationMs(state.phase, s)) };
  return { ...state, completedInSet };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const PHASE_LABEL: Record<Phase, string> = {
  focus: "Foco",
  short: "Pausa corta",
  long: "Pausa larga",
};

// ---------- Daily stats ----------

export interface FocusStats {
  /** Local date key (YYYY-MM-DD) to focus blocks and minutes that day. */
  days: Record<string, { sessions: number; minutes: number }>;
}

export function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function recordCompletions(stats: FocusStats, completions: Completion[]): FocusStats {
  const focus = completions.filter((c) => c.phase === "focus");
  if (focus.length === 0) return stats;
  const days = { ...stats.days };
  for (const c of focus) {
    const k = dayKey(c.at);
    const prev = days[k] ?? { sessions: 0, minutes: 0 };
    days[k] = { sessions: prev.sessions + 1, minutes: prev.minutes + c.focusMin };
  }
  return { days: pruneDays(days, focus[focus.length - 1].at) };
}

/** Keeps the last 120 days so localStorage never grows without bound. */
function pruneDays(days: FocusStats["days"], now: number): FocusStats["days"] {
  const cutoff = dayKey(now - 120 * 86_400_000);
  const out: FocusStats["days"] = {};
  for (const [k, v] of Object.entries(days)) if (k >= cutoff) out[k] = v;
  return out;
}

/** Consecutive days with at least one focus block, ending today (or yesterday if today is still empty). */
export function streakDays(stats: FocusStats, now: number): number {
  const has = (t: number) => (stats.days[dayKey(t)]?.sessions ?? 0) > 0;
  // Step by calendar day at local noon so DST shifts never skip or repeat a day.
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  let t = noon.getTime();
  if (!has(t)) t -= 86_400_000;
  let n = 0;
  while (has(t) && n < 400) {
    n++;
    const d = new Date(t);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    t = d.getTime();
  }
  return n;
}

export function todayStats(stats: FocusStats, now: number): { sessions: number; minutes: number } {
  return stats.days[dayKey(now)] ?? { sessions: 0, minutes: 0 };
}

/** Last `n` days, oldest first, for the week strip. */
export function recentDays(stats: FocusStats, now: number, n: number): { key: string; minutes: number; date: Date }[] {
  const out: { key: string; minutes: number; date: Date }[] = [];
  const base = new Date(now);
  base.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = dayKey(d.getTime());
    out.push({ key, minutes: stats.days[key]?.minutes ?? 0, date: d });
  }
  return out;
}
