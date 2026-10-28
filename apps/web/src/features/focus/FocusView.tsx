"use client";

import { ArrowsInIcon, ArrowsOutIcon, PictureInPictureIcon } from "@phosphor-icons/react/dist/ssr";
import { useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { NotifyCard, PresetChips, SoundCard, StatsCard, TasksCard, TimesCard } from "./cards";
import { FocusTimer, MiniTimer } from "./FocusTimer";
import { FocusSyncStatus } from "./FocusSyncStatus";
import { useFullscreen, usePipWindow, useShortcuts } from "./hooks";
import { BackButton } from "@/components/BackButton";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge, proLabel } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";

const iconBtn =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-app text-main transition-[transform,background-color] duration-150 hover:bg-[var(--surface-2)] active:scale-[0.94]";

export function FocusView() {
  const stageRef = useRef<HTMLElement | null>(null);
  const fs = useFullscreen(stageRef);
  const pip = usePipWindow();
  const { lock } = usePro();
  const locked = lock === "locked";
  // Fullscreen is a Pro extra: the F shortcut and the button share the same gate.
  const toggleFullscreen = () => {
    if (lock === "unknown") return;
    if (locked && !fs.on) openProUpsell("focus_fullscreen");
    else fs.toggle();
  };
  const togglePip = () => {
    if (lock === "unknown") return;
    if (locked) openProUpsell("focus_pip");
    else pip.open();
  };
  useShortcuts(toggleFullscreen);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-24 pt-6 md:pb-10">
      <FocusSyncStatus />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-1">
          <BackButton fallbackHref="/" />
          <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Un bloque a la vez</h1>
          <p className="text-sm text-muted">Elegí una tarea. El resto puede esperar.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {pip.supported ? (
            <button
              type="button"
              onClick={togglePip}
              className={`${iconBtn} relative`}
              aria-label={proLabel(pip.win ? "Cerrar mini ventana" : "Abrir mini ventana", locked)}
              title="Mini ventana"
              aria-pressed={!!pip.win}
            >
              <PictureInPictureIcon size={20} aria-hidden="true" />
              {locked ? <ProBadge /> : null}
            </button>
          ) : null}
          {fs.supported ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              className={`${iconBtn} relative hidden sm:flex`}
              aria-label={proLabel("Pantalla completa", locked)}
              title="Pantalla completa (F)"
            >
              <ArrowsOutIcon size={20} aria-hidden="true" />
              {locked ? <ProBadge /> : null}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            ref={stageRef}
            aria-label="Temporizador"
            className="focus-stage relative flex flex-col items-center gap-6 rounded-[24px] border border-app bg-surface px-4 py-7 sm:py-10 [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-app"
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
          <aside className="rounded-2xl border border-app bg-surface p-5"><p className="t-label text-primary">Estudiá y hacé crecer algo</p><h2 className="mt-3 text-lg font-bold">Tu jardín te espera</h2><p className="mt-2 text-sm leading-relaxed text-muted">Si estás en la sala, marcá “Estoy acá”. Ese tiempo hace crecer tus árboles, aunque cambies de pantalla.</p><Link href="/jardin" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Visitar mi jardín →</Link></aside>
          <details className="rounded-2xl border border-app bg-surface p-5"><summary className="cursor-pointer py-1 font-semibold">Sonidos y avisos</summary><div className="mt-4 space-y-5"><NotifyCard /><SoundCard /></div></details>
          <details className="rounded-2xl border border-app bg-surface p-5"><summary className="cursor-pointer py-1 font-semibold">Ajustar mis bloques</summary><div className="mt-4"><TimesCard /></div></details>
          <details className="rounded-2xl border border-app bg-surface p-5"><summary className="cursor-pointer py-1 font-semibold">Mi ritmo de estudio</summary><div className="mt-4"><StatsCard /></div></details>
          <p className="px-2 text-xs leading-relaxed text-muted">El Pomodoro básico es gratuito. Las herramientas avanzadas tienen su distintivo Pro.</p>
        </div>
      </div>

      {pip.win ? createPortal(<MiniTimer />, pip.win.document.body) : null}
    </main>
  );
}
