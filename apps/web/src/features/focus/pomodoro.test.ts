import { describe, expect, it } from "vitest";
import {
  CUSTOM_PRESETS_MAX,
  DEFAULT_SETTINGS,
  advance,
  customPresetIdFor,
  customPresetSettings,
  sanitizeCustomPreset,
  sanitizeCustomPresets,
  upsertCustomPreset,
  applySettings,
  formatClock,
  initialState,
  nextPhase,
  pause,
  presetIdFor,
  recentDays,
  recordCompletions,
  remainingMs,
  resetPhase,
  sanitizeSettings,
  selectPhase,
  skip,
  start,
  streakDays,
  tick,
  todayStats,
  type FocusSettings,
  type FocusStats,
} from "./pomodoro";

const MIN = 60_000;
const T0 = new Date(2026, 9, 3, 10, 0, 0).getTime();
const manual: FocusSettings = { ...DEFAULT_SETTINGS, autoStartBreaks: false, autoStartFocus: false };
const auto: FocusSettings = { ...DEFAULT_SETTINGS, autoStartBreaks: true, autoStartFocus: true };

describe("countdown", () => {
  it("starts at the full focus duration and counts from timestamps", () => {
    const s = start(initialState(manual), T0);
    expect(remainingMs(s, T0)).toBe(25 * MIN);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(s, T0 + 99 * MIN)).toBe(0);
  });

  it("pause freezes the remaining time and resume continues from it", () => {
    let s = start(initialState(manual), T0);
    s = pause(s, T0 + 5 * MIN);
    expect(s.status).toBe("paused");
    expect(remainingMs(s, T0 + 60 * MIN)).toBe(20 * MIN);
    s = start(s, T0 + 60 * MIN);
    expect(remainingMs(s, T0 + 70 * MIN)).toBe(10 * MIN);
  });

  it("reset restores the current phase's full duration, stopped", () => {
    const s = resetPhase(pause(start(selectPhase(initialState(manual), "short", manual), T0), T0 + MIN), manual);
    expect(s).toMatchObject({ phase: "short", status: "idle", remainingMs: 5 * MIN });
  });
});

describe("phase sequence", () => {
  it("goes focus, short, focus ... and a long break after the configured rounds", () => {
    let s = initialState(manual);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(s.phase);
      s = advance(s, manual, T0);
    }
    expect(seen).toEqual(["focus", "short", "focus", "short", "focus", "short", "focus", "long"]);
    expect(s.phase).toBe("focus");
    expect(s.completedInSet).toBe(0);
  });

  it("honours a custom round count", () => {
    const s3 = { ...manual, rounds: 2 };
    const a = nextPhase({ ...initialState(s3), completedInSet: 1 }, s3);
    expect(a.phase).toBe("long");
  });

  it("does not auto-start when disabled", () => {
    const s = advance(start(initialState(manual), T0), manual, T0 + 25 * MIN);
    expect(s).toMatchObject({ phase: "short", status: "idle", endsAt: null });
  });

  it("chains auto-started phases from the previous end, not from the late tick", () => {
    const s = start(initialState(auto), T0);
    const r = tick(s, auto, T0 + 25 * MIN + 7_000);
    expect(r.completed).toHaveLength(1);
    expect(r.state.phase).toBe("short");
    expect(r.state.endsAt).toBe(T0 + 30 * MIN);
  });

  it("settles several elapsed phases at once after a long sleep", () => {
    const s = start(initialState(auto), T0);
    // 25 focus + 5 break + 25 focus = 55 minutes; tick at 57.
    const r = tick(s, auto, T0 + 57 * MIN);
    expect(r.completed.map((c) => c.phase)).toEqual(["focus", "short", "focus"]);
    expect(r.state.phase).toBe("short");
    expect(r.completed.filter((c) => c.phase === "focus").every((c) => c.focusMin === 25)).toBe(true);
  });

  it("stops after one phase when auto-start is off", () => {
    const r = tick(start(initialState(manual), T0), manual, T0 + 300 * MIN);
    expect(r.completed).toHaveLength(1);
    expect(r.state.status).toBe("idle");
  });

  it("does nothing before the phase ends", () => {
    const s = start(initialState(manual), T0);
    expect(tick(s, manual, T0 + MIN).completed).toHaveLength(0);
  });

  it("skip moves on without crediting, and keeps a stopped timer stopped", () => {
    const idle = skip(initialState(auto), auto, T0);
    expect(idle).toMatchObject({ phase: "short", status: "idle" });
    const running = skip(start(initialState(auto), T0), auto, T0 + MIN);
    expect(running).toMatchObject({ phase: "short", status: "running", endsAt: T0 + 6 * MIN });
  });
});

describe("settings", () => {
  it("clamps out-of-range and junk values", () => {
    const s = sanitizeSettings({ focusMin: 0, shortMin: 999, longMin: Number.NaN, rounds: 2.6 });
    expect(s).toMatchObject({ focusMin: 1, shortMin: 60, longMin: 1, rounds: 3 });
  });

  it("recognises presets", () => {
    expect(presetIdFor(DEFAULT_SETTINGS)).toBe("25-5");
    expect(presetIdFor({ ...DEFAULT_SETTINGS, focusMin: 33 })).toBeNull();
  });

  it("re-times an idle timer and caps a paused one when durations change", () => {
    const idle = applySettings(initialState(manual), { ...manual, focusMin: 50 });
    expect(idle.remainingMs).toBe(50 * MIN);
    const paused = applySettings(pause(start(initialState(manual), T0), T0 + MIN), { ...manual, focusMin: 10 });
    expect(paused.remainingMs).toBe(10 * MIN);
  });
});

describe("formatClock", () => {
  it("rounds up to whole seconds and adds hours past 60 minutes", () => {
    expect(formatClock(25 * MIN)).toBe("25:00");
    expect(formatClock(59_001)).toBe("01:00");
    expect(formatClock(500)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(90 * MIN)).toBe("1:30:00");
  });
});

describe("stats", () => {
  const focusAt = (t: number) => ({ phase: "focus" as const, at: t, focusMin: 25 });

  it("credits only focus phases to the day they ended", () => {
    let st: FocusStats = { days: {} };
    st = recordCompletions(st, [focusAt(T0), { phase: "short", at: T0, focusMin: 0 }, focusAt(T0 + MIN)]);
    expect(todayStats(st, T0)).toEqual({ sessions: 2, minutes: 50 });
  });

  it("counts a streak of consecutive days, tolerating an empty today", () => {
    const day = 86_400_000;
    let st: FocusStats = { days: {} };
    st = recordCompletions(st, [focusAt(T0 - 3 * day), focusAt(T0 - 2 * day), focusAt(T0 - day)]);
    expect(streakDays(st, T0)).toBe(3);
    st = recordCompletions(st, [focusAt(T0)]);
    expect(streakDays(st, T0)).toBe(4);
    expect(streakDays(st, T0 + 2 * day)).toBe(0);
  });

  it("lists recent days oldest first", () => {
    const st = recordCompletions({ days: {} }, [focusAt(T0)]);
    const days = recentDays(st, T0, 7);
    expect(days).toHaveLength(7);
    expect(days[6].minutes).toBe(25);
    expect(days[0].minutes).toBe(0);
  });
});

describe("90/20 preset", () => {
  it("is recognized by presetIdFor", () => {
    expect(presetIdFor({ ...DEFAULT_SETTINGS, focusMin: 90, shortMin: 20, longMin: 30 })).toBe("90-20");
    expect(presetIdFor({ ...DEFAULT_SETTINGS, focusMin: 25, shortMin: 5, longMin: 15 })).toBe("25-5");
  });
});

describe("custom presets", () => {
  const mk = (i: number) => ({ id: `p${i}`, name: `P${i}`, focusMin: 30 + i, shortMin: 5 });

  it("clamps durations to the allowed bounds", () => {
    expect(sanitizeCustomPreset({ id: "a", name: "x", focusMin: 1, shortMin: 99, longMin: 500 })).toEqual({
      id: "a",
      name: "x",
      focusMin: 5,
      shortMin: 60,
      longMin: 90,
    });
    expect(sanitizeCustomPreset({ id: "a", name: "x", focusMin: 999, shortMin: 0 })).toMatchObject({ focusMin: 180, shortMin: 1 });
  });

  it("rejects unusable entries and names an unnamed one after its times", () => {
    expect(sanitizeCustomPreset(null)).toBeNull();
    expect(sanitizeCustomPreset({ name: "x", focusMin: 25, shortMin: 5 })).toBeNull();
    expect(sanitizeCustomPreset({ id: "a", focusMin: "abc", shortMin: 5 })).toBeNull();
    expect(sanitizeCustomPreset({ id: "a", name: "  ", focusMin: 25, shortMin: 5 })?.name).toBe("25 / 5");
  });

  it("caps the list at CUSTOM_PRESETS_MAX and drops duplicate ids", () => {
    const raw = Array.from({ length: 9 }, (_, i) => mk(i));
    expect(sanitizeCustomPresets(raw)).toHaveLength(CUSTOM_PRESETS_MAX);
    expect(sanitizeCustomPresets([mk(1), mk(1)])).toHaveLength(1);
    expect(sanitizeCustomPresets("x")).toEqual([]);
  });

  it("upsert replaces by id and ignores a new one past the cap", () => {
    let list = Array.from({ length: CUSTOM_PRESETS_MAX }, (_, i) => mk(i));
    expect(upsertCustomPreset(list, mk(99))).toHaveLength(CUSTOM_PRESETS_MAX);
    list = upsertCustomPreset(list, { ...mk(2), name: "Nuevo" });
    expect(list).toHaveLength(CUSTOM_PRESETS_MAX);
    expect(list[2].name).toBe("Nuevo");
    expect(upsertCustomPreset([], mk(0))).toHaveLength(1);
  });

  it("matches the current settings, falling back to the current long break", () => {
    const list = [{ id: "a", name: "A", focusMin: 35, shortMin: 7 }];
    const s = { ...DEFAULT_SETTINGS, focusMin: 35, shortMin: 7 };
    expect(customPresetIdFor(s, list)).toBe("a");
    expect(customPresetSettings(list[0], s).longMin).toBe(s.longMin);
    expect(customPresetIdFor({ ...s, shortMin: 8 }, list)).toBeNull();
  });
});
