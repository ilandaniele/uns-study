"use client";

import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon, SkipForwardIcon } from "@phosphor-icons/react/dist/ssr";
import { useNow } from "@/lib/use-now";
import { primeAudio } from "./focus-audio";
import { focusActions, useFocus } from "./focus-store";
import { PHASE_LABEL, formatClock, phaseDurationMs, remainingMs, type Phase } from "./pomodoro";

const PHASES: Phase[] = ["focus", "short", "long"];

/** Sliding segmented control: the thumb moves with a transform, never a layout property. */
function PhaseTabs({ compact }: { compact?: boolean }) {
  const { timer } = useFocus();
  const index = PHASES.indexOf(timer.phase);
  return (
    <div role="tablist" aria-label="Fase" className="relative grid w-full max-w-sm grid-cols-3 rounded-lg bg-[var(--surface-2)] p-1">
      <span
        aria-hidden="true"
        className="focus-ease absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-surface shadow-sm transition-transform duration-[240ms]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {PHASES.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={timer.phase === p}
          onClick={() => focusActions.selectPhase(p)}
          className={`relative z-10 rounded-md px-2 font-semibold transition-colors ${compact ? "min-h-8 text-xs" : "min-h-10 text-sm"} ${
            timer.phase === p ? "text-main" : "text-muted hover:text-main"
          }`}
        >
          {PHASE_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

function Clock({ big }: { big?: boolean }) {
  const { timer, settings } = useFocus();
  const now = useNow(250).getTime();
  const left = remainingMs(timer, now);
  const total = phaseDurationMs(timer.phase, settings);
  const progress = total > 0 ? 1 - left / total : 0;
  const clock = formatClock(left);
  return (
    <>
      <p
        className={`font-mono font-semibold leading-none tracking-[-0.04em] text-main ${
          big ? "text-[clamp(5.5rem,22vw,15rem)]" : "text-[clamp(4.75rem,21vw,8.5rem)]"
        } ${timer.status === "paused" ? "opacity-60" : ""}`}
        // Screen readers get the phase, not a number that changes every second.
        aria-hidden="true"
      >
        {clock}
      </p>
      <div aria-hidden="true" className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-[250ms] ease-linear ${
            timer.phase === "focus" ? "bg-primary" : "bg-[var(--text-faint)]"
          }`}
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
        />
      </div>
    </>
  );
}

function RoundPips() {
  const { timer, settings } = useFocus();
  const current = timer.phase === "focus" ? timer.completedInSet + 1 : timer.completedInSet;
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: settings.rounds }, (_, i) => {
          const done = i < timer.completedInSet || timer.phase === "long";
          const now = !done && i === timer.completedInSet && timer.phase === "focus";
          return (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-[3px] border transition-colors duration-300 ${
                done ? "border-transparent bg-primary" : now ? "border-[var(--primary)] bg-transparent" : "border-[var(--border-strong)] bg-transparent"
              }`}
            />
          );
        })}
      </div>
      <span className="text-sm text-muted">
        {timer.phase === "long" ? "Serie completa" : `Bloque ${Math.min(current, settings.rounds)} de ${settings.rounds}`}
      </span>
    </div>
  );
}

export function TimerControls({ compact }: { compact?: boolean }) {
  const { timer } = useFocus();
  const running = timer.status === "running";
  const label = running ? "Pausar" : timer.status === "paused" ? "Seguir" : timer.phase === "focus" ? "Empezar" : "Empezar pausa";
  const side = compact ? "h-10 w-10" : "h-12 w-12";
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => focusActions.resetPhase()}
        aria-label="Reiniciar fase"
        title="Reiniciar (R)"
        className={`${side} flex items-center justify-center rounded-lg text-muted transition-[transform,background-color] duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-main active:scale-[0.94]`}
      >
        <ArrowCounterClockwiseIcon size={compact ? 18 : 22} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => {
          primeAudio();
          focusActions.toggle();
        }}
        aria-keyshortcuts="Space"
        className={`flex items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-white transition-[transform,background-color] duration-150 ease-out hover:bg-primary-dark active:scale-[0.97] ${
          compact ? "h-10 min-w-28 px-4 text-sm" : "h-14 min-w-44 px-6 text-base"
        }`}
      >
        {running ? <PauseIcon size={compact ? 16 : 20} weight="fill" aria-hidden="true" /> : <PlayIcon size={compact ? 16 : 20} weight="fill" aria-hidden="true" />}
        {label}
      </button>
      <button
        type="button"
        onClick={() => focusActions.skip()}
        aria-label="Saltar a la siguiente fase"
        title="Saltar (S)"
        className={`${side} flex items-center justify-center rounded-lg text-muted transition-[transform,background-color] duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-main active:scale-[0.94]`}
      >
        <SkipForwardIcon size={compact ? 18 : 22} aria-hidden="true" />
      </button>
    </div>
  );
}

function CurrentTask() {
  const { tasks, activeTaskId, timer } = useFocus();
  const task = tasks.find((t) => t.id === activeTaskId && !t.done);
  if (!task || timer.phase !== "focus") return <p className="min-h-5 text-sm text-[var(--text-faint)]">{timer.phase === "focus" ? "Una cosa a la vez." : "Despegate de la pantalla un rato."}</p>;
  return (
    <p className="min-h-5 max-w-sm truncate text-sm text-muted">
      Ahora: <span className="font-semibold text-main">{task.text}</span>
    </p>
  );
}

/** Live status for assistive tech: announced only when the phase or run state changes. */
function SrStatus() {
  const { timer } = useFocus();
  const state = timer.status === "running" ? "en marcha" : timer.status === "paused" ? "en pausa" : "detenido";
  return (
    <p className="sr-only" aria-live="polite">
      {PHASE_LABEL[timer.phase]}, {state}
    </p>
  );
}

export function FocusTimer({ big }: { big?: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <PhaseTabs />
      <div className="flex w-full flex-col items-center gap-5">
        <Clock big={big} />
        <RoundPips />
      </div>
      <TimerControls />
      <CurrentTask />
      <SrStatus />
    </div>
  );
}

/** Small layout for the Picture-in-Picture window. */
export function MiniTimer() {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3 bg-app p-3 text-center">
      <MiniClock />
      <TimerControls compact />
    </div>
  );
}

function MiniClock() {
  const { timer } = useFocus();
  const now = useNow(250).getTime();
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="label-caps text-muted">{timer.status === "paused" ? "En pausa" : PHASE_LABEL[timer.phase]}</span>
      <span className="font-mono text-[clamp(2.5rem,24vw,4.5rem)] font-semibold leading-none tracking-[-0.04em] text-main">
        {formatClock(remainingMs(timer, now))}
      </span>
    </div>
  );
}
