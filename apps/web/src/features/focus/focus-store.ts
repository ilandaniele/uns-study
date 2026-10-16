"use client";

import { useSyncExternalStore } from "react";
import { MAX_LAYERS, normalizeLayers, type AmbientKind, type AmbientLayer } from "./focus-audio";
import {
  DEFAULT_SETTINGS,
  applySettings,
  initialState,
  recordCompletions,
  resetAll,
  resetPhase,
  sanitizeCustomPresets,
  sanitizeSettings,
  selectPhase,
  skip,
  tick,
  toggle,
  upsertCustomPreset,
  type Completion,
  type CustomPreset,
  type FocusSettings,
  type FocusStats,
  type Phase,
  type TimerState,
} from "./pomodoro";

export interface FocusTask {
  id: string;
  text: string;
  done: boolean;
  /** Focus blocks finished while this was the current task. */
  pomodoros: number;
}

export interface FocusData {
  settings: FocusSettings;
  timer: TimerState;
  stats: FocusStats;
  tasks: FocusTask[];
  activeTaskId: string | null;
  /** Ambient sounds playing together: at most MAX_LAYERS, unique kinds. Replaces the single `ambient` of older saves. */
  layers: AmbientLayer[];
  /** Master volume for all layers. */
  volume: number;
  customPresets: CustomPreset[];
  chime: boolean;
}

const KEY = "sala.focus.v1";
const MAX_TASKS = 50;

function defaults(): FocusData {
  return {
    settings: DEFAULT_SETTINGS,
    timer: initialState(DEFAULT_SETTINGS),
    stats: { days: {} },
    tasks: [],
    activeTaskId: null,
    layers: [],
    volume: 0.5,
    customPresets: [],
    chime: true,
  };
}

const SERVER_SNAPSHOT = defaults();
let data: FocusData | null = null;
const listeners = new Set<() => void>();

function isPhase(v: unknown): v is Phase {
  return v === "focus" || v === "short" || v === "long";
}

/**
 * Defensive parse: anything malformed in storage falls back to defaults instead of crashing the app.
 * Saves from before layers existed carry `ambient` instead of `layers`; they are migrated on read
 * and only rewritten by the next state change.
 */
export function parseFocusData(raw: string | null): FocusData {
  const d = defaults();
  if (!raw) return d;
  try {
    const j = JSON.parse(raw) as Partial<FocusData> & { ambient?: unknown };
    const settings = sanitizeSettings(j.settings);
    const t = j.timer;
    const timer: TimerState =
      t && isPhase(t.phase) && (t.status === "idle" || t.status === "running" || t.status === "paused")
        ? {
            phase: t.phase,
            completedInSet: Math.max(0, Math.min(settings.rounds - 1, Number(t.completedInSet) || 0)),
            status: t.status === "running" && typeof t.endsAt !== "number" ? "idle" : t.status,
            endsAt: t.status === "running" && typeof t.endsAt === "number" ? t.endsAt : null,
            remainingMs: Number.isFinite(t.remainingMs) && t.remainingMs >= 0 ? t.remainingMs : initialState(settings).remainingMs,
          }
        : initialState(settings);
    const tasks = Array.isArray(j.tasks)
      ? j.tasks
          .filter((x): x is FocusTask => !!x && typeof x.id === "string" && typeof x.text === "string")
          .slice(0, MAX_TASKS)
          .map((x) => ({ id: x.id, text: x.text.slice(0, 120), done: !!x.done, pomodoros: Math.max(0, Number(x.pomodoros) || 0) }))
      : [];
    return {
      settings,
      timer,
      stats: j.stats && typeof j.stats.days === "object" && j.stats.days ? { days: j.stats.days } : d.stats,
      tasks,
      activeTaskId: tasks.some((x) => x.id === j.activeTaskId) ? (j.activeTaskId as string) : null,
      // Sound never auto-resumes after a reload: browsers block audio without a tap anyway.
      layers: normalizeLayers(j.layers, j.ambient, j.volume),
      volume: typeof j.volume === "number" ? Math.min(1, Math.max(0, j.volume)) : d.volume,
      chime: j.chime !== false,
      customPresets: sanitizeCustomPresets(j.customPresets),
    };
  } catch {
    return d;
  }
}

function readStorage(): FocusData {
  try {
    return parseFocusData(window.localStorage.getItem(KEY));
  } catch {
    return defaults();
  }
}

function load(): FocusData {
  if (!data) data = readStorage();
  return data;
}

function emit() {
  for (const l of listeners) l();
}

function commit(next: FocusData) {
  data = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota: the timer still works for this tab.
  }
  emit();
}

function update(fn: (d: FocusData) => FocusData) {
  commit(fn(load()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the timer: pick it up so every tab shows the same countdown.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    data = parseFocusData(e.newValue);
    emit();
  };
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function useFocus(): FocusData {
  return useSyncExternalStore(subscribe, load, () => SERVER_SNAPSHOT);
}

export function getFocus(): FocusData {
  return load();
}

// ---------- Actions ----------

export const focusActions = {
  toggle() {
    update((d) => ({ ...d, timer: toggle(d.timer, Date.now()) }));
  },
  resetPhase() {
    update((d) => ({ ...d, timer: resetPhase(d.timer, d.settings) }));
  },
  resetAll() {
    update((d) => ({ ...d, timer: resetAll(d.settings) }));
  },
  skip() {
    update((d) => ({ ...d, timer: skip(d.timer, d.settings, Date.now()) }));
  },
  selectPhase(phase: Phase) {
    update((d) => (d.timer.phase === phase && d.timer.status !== "running" ? d : { ...d, timer: selectPhase(d.timer, phase, d.settings) }));
  },
  setSettings(patch: Partial<FocusSettings>) {
    update((d) => {
      const settings = sanitizeSettings({ ...d.settings, ...patch });
      return { ...d, settings, timer: applySettings(d.timer, settings) };
    });
  },
  /** Adds or retunes one ambient layer; `null` removes it. A fifth distinct kind is ignored. */
  setLayer(kind: AmbientKind, volume: number | null) {
    update((d) => {
      const rest = d.layers.filter((l) => l.kind !== kind);
      if (volume === null) return rest.length === d.layers.length ? d : { ...d, layers: rest };
      const layer = { kind, volume: Math.min(1, Math.max(0, volume)) };
      if (rest.length === d.layers.length) return d.layers.length >= MAX_LAYERS ? d : { ...d, layers: [...d.layers, layer] };
      return { ...d, layers: d.layers.map((l) => (l.kind === kind ? layer : l)) };
    });
  },
  /** Saves a custom timer preset (same id replaces it); past the cap a new one is ignored. */
  saveCustomPreset(p: Omit<CustomPreset, "id"> & { id?: string }) {
    const id = p.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    update((d) => ({ ...d, customPresets: upsertCustomPreset(d.customPresets, { ...p, id }) }));
  },
  deleteCustomPreset(id: string) {
    update((d) => ({ ...d, customPresets: d.customPresets.filter((p) => p.id !== id) }));
  },
  setVolume(volume: number) {
    update((d) => ({ ...d, volume: Math.min(1, Math.max(0, volume)) }));
  },
  setChime(chime: boolean) {
    update((d) => ({ ...d, chime }));
  },
  addTask(text: string) {
    const clean = text.trim().slice(0, 120);
    if (!clean) return;
    update((d) => {
      if (d.tasks.length >= MAX_TASKS) return d;
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const tasks = [...d.tasks, { id, text: clean, done: false, pomodoros: 0 }];
      return { ...d, tasks, activeTaskId: d.activeTaskId ?? id };
    });
  },
  toggleTask(id: string) {
    update((d) => {
      const tasks = d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      const nowDone = tasks.find((t) => t.id === id)?.done;
      // Finishing the current task hands "current" to the next open one.
      const activeTaskId = nowDone && d.activeTaskId === id ? (tasks.find((t) => !t.done)?.id ?? null) : d.activeTaskId;
      return { ...d, tasks, activeTaskId };
    });
  },
  setActiveTask(id: string | null) {
    update((d) => ({ ...d, activeTaskId: id }));
  },
  removeTask(id: string) {
    update((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id), activeTaskId: d.activeTaskId === id ? null : d.activeTaskId }));
  },
  clearDone() {
    update((d) => ({ ...d, tasks: d.tasks.filter((t) => !t.done) }));
  },
  /**
   * Settles any phase that ended. Re-reads storage first so two open tabs never both credit
   * (and both announce) the same completed phase.
   */
  settle(now: number): Completion[] {
    const cur = load();
    if (cur.timer.status !== "running" || cur.timer.endsAt === null || cur.timer.endsAt > now) return [];
    const fresh = readStorage();
    data = fresh;
    const r = tick(fresh.timer, fresh.settings, now);
    if (r.completed.length === 0) {
      emit();
      return [];
    }
    const focusDone = r.completed.filter((c) => c.phase === "focus").length;
    const tasks =
      focusDone > 0 && fresh.activeTaskId
        ? fresh.tasks.map((t) => (t.id === fresh.activeTaskId ? { ...t, pomodoros: t.pomodoros + focusDone } : t))
        : fresh.tasks;
    commit({ ...fresh, timer: r.state, stats: recordCompletions(fresh.stats, r.completed), tasks });
    return r.completed;
  },
};
