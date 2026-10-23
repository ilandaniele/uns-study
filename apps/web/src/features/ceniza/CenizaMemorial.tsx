"use client";

import { useId, useRef } from "react";
import { HeartIcon } from "@phosphor-icons/react/dist/ssr";
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
      onClick={(event) => { event.stopPropagation(); requestClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`${closing ? "dialog-exit" : "dialog-enter"} w-full max-w-sm rounded-t-sheet border border-app bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-center shadow-xl sm:rounded-float`}
        onClick={(event) => event.stopPropagation()}
      >
        <HeartIcon aria-hidden="true" size={32} weight="duotone" className="mx-auto mb-3 text-primary" />
        <h2 id={titleId} className="text-xl font-semibold text-main">En memoria de Ceniza</h2>
        <p id={descriptionId} className="mt-2 text-muted">El perro de la sala.</p>
        <button ref={dismiss} type="button" onClick={requestClose} className="mt-5 min-h-11 w-full rounded-control border border-app px-4 font-medium text-main hover:bg-surface-2">
          Cerrar
        </button>
      </div>
    </div>
  );
}
