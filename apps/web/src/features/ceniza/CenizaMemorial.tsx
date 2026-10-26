"use client";

import { useId, useRef } from "react";
import {
  HeartIcon,
  InstagramLogoIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useExitTransition } from "@/lib/useExitTransition";

export function CenizaMemorial({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const { closing, requestClose } = useExitTransition(onClose);
  useFocusTrap(panel, { initialFocus: dismiss, onEscape: requestClose });

  return (
    <div
      className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4`}
      onClick={(event) => {
        event.stopPropagation();
        requestClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`${closing ? "dialog-exit" : "dialog-enter"} relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-center shadow-xl sm:rounded-float`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={dismiss}
          type="button"
          aria-label="Cerrar"
          onClick={requestClose}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2"
        >
          <XIcon size={21} aria-hidden="true" />
        </button>
        <HeartIcon
          aria-hidden="true"
          size={32}
          weight="duotone"
          className="mx-auto mb-3 text-primary"
        />
        <h2 id={titleId} className="text-xl font-semibold text-main">
          En memoria de Ceniza
        </h2>
        <p className="mt-2 text-muted">El perro de la sala.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size, preoptimized local WebP */}
        <img
          src="/room/ceniza-recuerdo.webp"
          alt="Ceniza descansando, con sus patitas blancas apoyadas en el suelo"
          width={384}
          height={364}
          className="mt-4 aspect-[384/364] w-full rounded-2xl object-cover"
        />
        <p
          id={descriptionId}
          className="mt-4 text-sm leading-relaxed text-muted"
        >
          Ceniza, conocido como «el gordo», fue un compañero muy querido de la
          comunidad universitaria de la UNS de Alem. Este pequeño homenaje lo
          recuerda entre las mesas y las horas de estudio que compartimos.
        </p>
        <a
          href="https://www.instagram.com/elgordoceniza/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white"
        >
          <InstagramLogoIcon size={20} aria-hidden="true" />
          @elgordoceniza
        </a>
        <button
          type="button"
          aria-label="Cerrar recuerdo"
          onClick={requestClose}
          className="mt-5 min-h-11 w-full rounded-control border border-app px-4 font-medium text-main hover:bg-surface-2"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
