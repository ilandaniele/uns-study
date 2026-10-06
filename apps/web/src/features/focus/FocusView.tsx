"use client";

import { ArrowsInIcon, ArrowsOutIcon, PictureInPictureIcon } from "@phosphor-icons/react/dist/ssr";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { NotifyCard, PresetChips, SoundCard, StatsCard, TasksCard, TimesCard } from "./cards";
import { FocusTimer, MiniTimer } from "./FocusTimer";
import { useFullscreen, usePipWindow, useShortcuts } from "./hooks";
import { BackButton } from "@/components/BackButton";

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
        <div className="flex items-start gap-1">
          <BackButton fallbackHref="/" />
          <div className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">Foco</h1>
          <p className="text-sm text-muted">Bloques de estudio con pausas. Sigue corriendo aunque cambies de pantalla.</p>
          </div>
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
