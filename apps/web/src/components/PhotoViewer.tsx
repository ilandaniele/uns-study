"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef } from "react";
import { useExitTransition } from "@/lib/useExitTransition";

/** Full-screen viewer showing a whole photo (uncropped). Mount it while open; `onClose` unmounts it. */
export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { closing, requestClose } = useExitTransition(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [requestClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-[80] flex items-center justify-center bg-black/85`}
      onClick={requestClose}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={requestClose}
        aria-label="Cerrar foto"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <XIcon aria-hidden="true" size={24} weight="bold" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external URLs, not a build-time asset */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className={`${closing ? "dialog-exit" : "dialog-enter"} max-h-[calc(100dvh-96px)] max-w-[calc(100vw-32px)] rounded-[12px] object-contain`}
      />
    </div>
  );
}
