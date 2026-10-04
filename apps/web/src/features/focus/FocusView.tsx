"use client";

import {
  ArrowsInIcon,
  ArrowsOutIcon,
  BellIcon,
  BellRingingIcon,
  CheckIcon,
  FireIcon,
  MinusIcon,
  PictureInPictureIcon,
  PlusIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TimerIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNow } from "@/lib/use-now";
import { AMBIENT_LABEL, playChime, primeAudio, type Ambient } from "./focus-audio";
import { notifyPermission, requestNotifyPermission, showFocusNotification, type NotifyPermission } from "./focus-notify";
import { focusActions, getFocus, useFocus } from "./focus-store";
import { FocusTimer, MiniTimer } from "./FocusTimer";
import { LIMITS, PRESETS, presetIdFor, recentDays, streakDays, todayStats, type FocusSettings } from "./pomodoro";

const noopSubscribe = () => () => {};
/** False during SSR and hydration, true after: gates anything that depends on the local clock or browser APIs. */
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-app bg-surface p-4">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
        <h2 className="label-caps text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left"
    >
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-main">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-[var(--border-strong)]"}`}
      >
        <span
          className={`focus-ease absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}

// ---------- Times ----------

function Stepper({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(n);
    setDraft(null);
  };
  const btn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-[transform,background-color] duration-150 hover:bg-[var(--surface-2)] hover:text-main active:scale-[0.94] disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-main">{label}</span>
      <div className="flex items-center rounded-xl border border-app">
        <button type="button" className={btn} aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <MinusIcon size={16} aria-hidden="true" />
        </button>
        <label className="flex items-baseline gap-0.5">
          <span className="sr-only">{label}</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft ?? String(value)}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onFocus={(e) => e.target.select()}
            className="w-9 bg-transparent text-center font-mono text-base font-semibold text-main outline-none"
          />
          {unit ? <span className="text-xs text-muted">{unit}</span> : null}
        </label>
        <button type="button" className={btn} aria-label={`Más ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <PlusIcon size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function TimesCard() {
  const { settings } = useFocus();
  const set = (patch: Partial<FocusSettings>) => focusActions.setSettings(patch);
  return (
    <Card title="Tiempos">
      <div className="flex flex-col gap-2">
        <Stepper label="Foco" unit="min" value={settings.focusMin} min={LIMITS.focusMin[0]} max={LIMITS.focusMin[1]} onChange={(v) => set({ focusMin: v })} />
        <Stepper label="Pausa corta" unit="min" value={settings.shortMin} min={LIMITS.shortMin[0]} max={LIMITS.shortMin[1]} onChange={(v) => set({ shortMin: v })} />
        <Stepper label="Pausa larga" unit="min" value={settings.longMin} min={LIMITS.longMin[0]} max={LIMITS.longMin[1]} onChange={(v) => set({ longMin: v })} />
        <Stepper label="Bloques por serie" value={settings.rounds} min={LIMITS.rounds[0]} max={LIMITS.rounds[1]} onChange={(v) => set({ rounds: v })} />
      </div>
      <div className="mt-3 flex flex-col border-t border-app pt-2">
        <Switch label="Arrancar pausas solas" checked={settings.autoStartBreaks} onChange={(v) => set({ autoStartBreaks: v })} />
        <Switch label="Arrancar foco solo" hint="Después de cada pausa" checked={settings.autoStartFocus} onChange={(v) => set({ autoStartFocus: v })} />
      </div>
    </Card>
  );
}

function PresetChips() {
  const { settings } = useFocus();
  const current = presetIdFor(settings);
  return (
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Combinaciones rápidas">
      {PRESETS.map((p) => {
        const on = current === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => focusActions.setSettings({ focusMin: p.focusMin, shortMin: p.shortMin, longMin: p.longMin })}
            className={`min-h-11 rounded-lg border px-3.5 font-mono text-sm font-semibold transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] ${
              on ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-main" : "border-app text-muted hover:bg-[var(--surface-2)] hover:text-main"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sound ----------

const AMBIENTS: Ambient[] = ["off", "white", "pink", "brown"];

function SoundCard() {
  const { ambient, volume, chime } = useFocus();
  return (
    <Card title="Sonido">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sonido de fondo">
        {AMBIENTS.map((k) => {
          const on = ambient === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => {
                primeAudio();
                focusActions.setAmbient(k);
              }}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] ${
                on ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-main" : "border-app text-muted hover:bg-[var(--surface-2)] hover:text-main"
              }`}
            >
              {k === "off" ? <SpeakerSlashIcon size={16} aria-hidden="true" /> : <SpeakerHighIcon size={16} aria-hidden="true" />}
              {AMBIENT_LABEL[k]}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Suena solo mientras corre un bloque de foco.</p>
      <label className="mt-3 flex items-center gap-3">
        <span className="text-sm font-semibold text-main">Volumen</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => focusActions.setVolume(Number(e.target.value) / 100)}
          className="h-11 flex-1 accent-[var(--primary)]"
        />
        <span className="w-9 text-right font-mono text-xs text-muted">{Math.round(volume * 100)}</span>
      </label>
      <div className="mt-1 flex items-center gap-2 border-t border-app pt-2">
        <div className="flex-1">
          <Switch label="Campana al cambiar" checked={chime} onChange={(v) => focusActions.setChime(v)} />
        </div>
        <button
          type="button"
          onClick={() => {
            primeAudio();
            playChime("break", getFocus().volume || 0.6);
          }}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-[var(--surface-2)]"
        >
          Probar
        </button>
      </div>
    </Card>
  );
}

// ---------- Notifications ----------

function NotifyCard() {
  const initial = useSyncExternalStore<NotifyPermission | null>(noopSubscribe, notifyPermission, () => null);
  const [asked, setPerm] = useState<NotifyPermission | null>(null);
  const state = asked ?? initial;

  async function enable() {
    primeAudio();
    const p = await requestNotifyPermission();
    setPerm(p);
    if (p === "granted") void showFocusNotification("Avisos activados", "Te avisamos acá cuando termine cada bloque.");
  }

  return (
    <Card title="Avisos">
      {state === "granted" ? (
        <div className="flex items-start gap-3">
          <BellRingingIcon size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-main">
            Activados. Si estás en otra pestaña o app, te avisamos cuando termina cada bloque.
          </p>
        </div>
      ) : state === "denied" ? (
        <div className="flex items-start gap-3">
          <BellIcon size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            Están bloqueados. Habilitalos desde el candado de la barra de direcciones. La campana suena igual.
          </p>
        </div>
      ) : state === "unsupported" ? (
        <div className="flex items-start gap-3">
          <BellIcon size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            Este navegador no muestra avisos. En iPhone, agregá la app a la pantalla de inicio. La campana suena igual.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Un aviso cuando termina el foco o la pausa, aunque estés en otra pestaña.</p>
          <button
            type="button"
            onClick={enable}
            disabled={state === null}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-app bg-surface font-semibold text-main transition-[transform,background-color] duration-150 hover:bg-[var(--surface-2)] active:scale-[0.97] disabled:opacity-50"
          >
            <BellIcon size={18} aria-hidden="true" />
            Activar avisos
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------- Stats ----------

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function StatsCard() {
  const mounted = useMounted();
  const { stats } = useFocus();
  const now = useNow(60_000).getTime();
  if (!mounted) {
    return (
      <Card title="Hoy">
        <div className="h-[148px]" />
      </Card>
    );
  }
  const today = todayStats(stats, now);
  const streak = streakDays(stats, now);
  const days = recentDays(stats, now, 7);
  const max = Math.max(30, ...days.map((d) => d.minutes));
  const week = days.reduce((a, d) => a + d.minutes, 0);
  return (
    <Card title="Hoy">
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-xs text-muted">Bloques</dt>
          <dd className="font-mono text-2xl font-semibold text-main">{today.sessions}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Foco</dt>
          <dd className="font-mono text-2xl font-semibold text-main">
            {today.minutes}
            <span className="ml-0.5 text-xs font-normal text-muted">min</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Racha</dt>
          <dd className="flex items-center gap-1 font-mono text-2xl font-semibold text-main">
            {streak}
            {streak > 0 ? <FireIcon size={16} weight="fill" className="text-primary" aria-hidden="true" /> : null}
            <span className="sr-only">{streak === 1 ? "día" : "días"}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-app pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs text-muted">Últimos 7 días</span>
          <span className="font-mono text-xs text-muted">{formatMinutes(week)}</span>
        </div>
        <ol className="grid h-16 grid-cols-7 items-end gap-1.5" aria-label="Minutos de foco por día">
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            const label = d.date.toLocaleDateString("es-AR", { weekday: "long" });
            return (
              <li key={d.key} className="flex h-full flex-col items-center justify-end gap-1" aria-label={`${label}: ${d.minutes} min`}>
                <div className="relative w-full flex-1 overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
                  <div
                    className={`focus-ease absolute inset-0 origin-bottom transition-transform duration-500 ${isToday ? "bg-primary" : "bg-[color-mix(in_srgb,var(--primary)_45%,var(--surface-2))]"}`}
                    style={{ transform: `scaleY(${d.minutes / max})` }}
                  />
                </div>
                <span aria-hidden="true" className={`text-[10px] font-semibold uppercase ${isToday ? "text-main" : "text-muted"}`}>
                  {d.date.toLocaleDateString("es-AR", { weekday: "narrow" })}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

// ---------- Tasks ----------

function TasksCard() {
  const { tasks, activeTaskId } = useFocus();
  const [text, setText] = useState("");
  const done = tasks.filter((t) => t.done).length;

  function add(e: FormEvent) {
    e.preventDefault();
    focusActions.addTask(text);
    setText("");
  }

  return (
    <Card
      title="Tareas"
      action={
        done > 0 ? (
          <button type="button" onClick={() => focusActions.clearDone()} className="min-h-8 rounded-md px-2 text-xs font-semibold text-muted hover:bg-[var(--surface-2)] hover:text-main">
            Borrar hechas ({done})
          </button>
        ) : null
      }
    >
      <form onSubmit={add} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Nueva tarea</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={120}
            placeholder="¿En qué vas a trabajar?"
            className="h-11 w-full rounded-lg border border-app bg-[var(--surface-2)] px-3 text-base text-main outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--primary)] sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Agregar tarea"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-[transform,opacity] duration-150 hover:bg-primary-dark active:scale-[0.94] disabled:opacity-40"
        >
          <PlusIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Anotá una tarea y elegila como actual: cada bloque terminado se le suma.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {tasks.map((t) => {
            const current = t.id === activeTaskId && !t.done;
            return (
              <li
                key={t.id}
                className={`group flex items-center gap-1 rounded-lg pl-1 ${current ? "bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--primary)]" : ""}`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.done ? `Marcar pendiente: ${t.text}` : `Marcar hecha: ${t.text}`}
                  onClick={() => focusActions.toggleTask(t.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-[5px] border transition-colors duration-150 ${
                      t.done ? "border-transparent bg-primary text-white" : "border-[var(--border-strong)]"
                    }`}
                  >
                    {t.done ? <CheckIcon size={12} weight="bold" aria-hidden="true" /> : null}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={t.done}
                  onClick={() => focusActions.setActiveTask(current ? null : t.id)}
                  aria-pressed={current}
                  title={current ? "Tarea actual" : "Elegir como actual"}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className={`min-w-0 flex-1 truncate text-sm ${t.done ? "text-muted line-through" : "text-main"} ${current ? "font-semibold" : ""}`}>{t.text}</span>
                  {current ? <span className="label-caps shrink-0 text-primary">Ahora</span> : null}
                  {t.pomodoros > 0 ? (
                    <span className="flex shrink-0 items-center gap-0.5 font-mono text-xs text-muted" aria-label={`${t.pomodoros} bloques`}>
                      <TimerIcon size={12} aria-hidden="true" />
                      {t.pomodoros}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => focusActions.removeTask(t.id)}
                  aria-label={`Borrar: ${t.text}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-main"
                >
                  <TrashIcon size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- Mini window (Document Picture-in-Picture) ----------

interface PipApi {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

function getPipApi(): PipApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null;
}

function usePipWindow() {
  const [win, setWin] = useState<Window | null>(null);
  const mounted = useMounted();
  const supported = mounted && getPipApi() !== null;

  const open = useCallback(async () => {
    const api = getPipApi();
    if (!api) return;
    if (api.window) {
      api.window.close();
      return;
    }
    const pip = await api.requestWindow({ width: 300, height: 220 });
    // Same styles and theme as the app.
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      pip.document.head.appendChild(node.cloneNode(true));
    }
    pip.document.documentElement.className = document.documentElement.className;
    pip.document.title = "Foco";
    pip.document.body.className = "bg-app text-main antialiased";
    pip.addEventListener("pagehide", () => setWin(null), { once: true });
    setWin(pip);
  }, []);

  // Keep the theme in sync if the user flips it while the mini window is open.
  useEffect(() => {
    if (!win) return;
    const obs = new MutationObserver(() => {
      win.document.documentElement.className = document.documentElement.className;
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [win]);

  return { supported, win, open };
}

// ---------- Fullscreen + shortcuts ----------

function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const mounted = useMounted();
  const supported = mounted && typeof document !== "undefined" && !!document.fullscreenEnabled;
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [ref]);
  const toggle = useCallback(() => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen().catch(() => {});
  }, [ref]);
  return { supported, on, toggle };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

function useShortcuts(toggleFullscreen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === " " || e.code === "Space") {
        // A focused button already reacts to Space on its own.
        if (e.target instanceof HTMLElement && e.target.closest("button, a, [role='switch'], [role='checkbox']")) return;
        e.preventDefault();
        primeAudio();
        focusActions.toggle();
      } else if (key === "r") focusActions.resetPhase();
      else if (key === "s") focusActions.skip();
      else if (key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);
}

// ---------- Page ----------

const iconBtn =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-app text-main transition-[transform,background-color] duration-150 hover:bg-[var(--surface-2)] active:scale-[0.94]";

export function FocusView() {
  const stageRef = useRef<HTMLElement | null>(null);
  const fs = useFullscreen(stageRef);
  const pip = usePipWindow();
  useShortcuts(fs.toggle);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">Foco</h1>
          <p className="text-sm text-muted">Bloques de estudio con pausas. Sigue corriendo aunque cambies de pantalla.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {pip.supported ? (
            <button type="button" onClick={pip.open} className={iconBtn} aria-label={pip.win ? "Cerrar mini ventana" : "Abrir mini ventana"} title="Mini ventana" aria-pressed={!!pip.win}>
              <PictureInPictureIcon size={20} aria-hidden="true" />
            </button>
          ) : null}
          {fs.supported ? (
            <button type="button" onClick={fs.toggle} className={`${iconBtn} hidden sm:flex`} aria-label="Pantalla completa" title="Pantalla completa (F)">
              <ArrowsOutIcon size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            ref={stageRef}
            aria-label="Temporizador"
            className="relative flex flex-col items-center gap-6 rounded-3xl border border-app bg-surface px-4 py-7 sm:py-10 [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-app"
          >
            {fs.on ? (
              <button type="button" onClick={fs.toggle} className={`${iconBtn} absolute right-4 top-4`} aria-label="Salir de pantalla completa" title="Salir (F)">
                <ArrowsInIcon size={20} aria-hidden="true" />
              </button>
            ) : null}
            <FocusTimer big={fs.on} />
            {fs.on ? null : (
              <div className="flex w-full flex-col items-center gap-3 border-t border-app pt-5">
                <PresetChips />
                <p className="hidden text-xs text-[var(--text-faint)] sm:block">
                  Atajos: <kbd className="font-mono">Espacio</kbd> empezar/pausar · <kbd className="font-mono">R</kbd> reiniciar · <kbd className="font-mono">S</kbd> saltar ·{" "}
                  <kbd className="font-mono">F</kbd> pantalla completa
                </p>
              </div>
            )}
          </section>
          <TasksCard />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <StatsCard />
          <NotifyCard />
          <SoundCard />
          <TimesCard />
        </div>
      </div>

      {pip.win ? createPortal(<MiniTimer />, pip.win.document.body) : null}
    </main>
  );
}
