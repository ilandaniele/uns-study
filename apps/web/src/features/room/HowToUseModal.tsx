"use client";

import { CheckCircleIcon, HandPointingIcon, MapPinIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <HandPointingIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Tocá un lugar",
    body: "Elegí cualquier asiento del mapa para ver su estado y sus detalles.",
  },
  {
    icon: <MapPinIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Estoy acá",
    body: "Marcalo cuando te sientes de verdad. Vale por 3 horas.",
  },
  {
    icon: <CheckCircleIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Está libre / Está ocupado",
    body: "Si pasás por un lugar que no es tuyo, contá lo que ves para ayudar al resto.",
  },
  {
    icon: <CheckCircleIcon aria-hidden="true" size={20} weight="bold" />,
    title: "Votaciones",
    body: "Si algo no cuadra, cualquiera puede abrir una votación rápida para resolverlo.",
  },
];

/** "Ver cómo usar la app" — a short, static walkthrough opened from the left panel. */
export function HowToUseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-use-title"
        className="dialog-enter w-full max-w-sm rounded-t-2xl border border-app bg-surface p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="how-to-use-title" className="font-display text-lg font-bold text-main">
            Cómo usar la app
          </h2>
          <button
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
