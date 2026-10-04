"use client";

import { CheckCircleIcon, HandPointingIcon, MapPinIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <HandPointingIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Tocá un lugar",
    body: "Elegí cualquier lugar del mapa para ver su estado.",
  },
  {
    icon: <MapPinIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Estoy acá",
    body: "Marcalo cuando te sientes. Elegís hasta qué hora (máximo 3 h) y te pedimos la ubicación para confirmar que estás en la sala. Antes de que venza te avisamos para que marques «Sigo acá».",
  },
  {
    icon: <CheckCircleIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Está libre / ocupado / guardado",
    body: "Si ves un lugar que no es tuyo, contá cómo está para ayudar al resto.",
  },
  {
    icon: <CheckCircleIcon aria-hidden="true" size={20} weight="bold" />,
    title: "¿Algo no cuadra?",
    body: "Si un lugar figura mal, abrí una votación rápida y la gente de la sala decide.",
  },
];

/** "Ver cómo usar la app" — a short, static walkthrough opened from the left panel. */
export function HowToUseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-use-title"
        className="dialog-enter w-full max-w-sm rounded-t-2xl border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="how-to-use-title" className="font-display text-lg font-bold text-main">
            Cómo usar la app
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-2)] hover:text-main"
          >
            <XIcon aria-hidden="true" size={18} />
          </button>
        </div>
        <ol className="mt-4 flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {step.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-main">
                  {i + 1}. {step.title}
                </p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
