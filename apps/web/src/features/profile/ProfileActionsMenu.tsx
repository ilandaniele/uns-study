"use client";

import { DotsThreeIcon, FlagIcon, ProhibitIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useRef } from "react";

export function ProfileActionsMenu({ userId, blocked, busy, onBlockToggle }: {
  userId: string;
  blocked: boolean;
  busy: boolean;
  onBlockToggle: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target)) detailsRef.current?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !detailsRef.current?.open) return;
      event.preventDefault();
      detailsRef.current?.removeAttribute("open");
      detailsRef.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="relative col-start-3 row-start-1 shrink-0 self-start">
      <summary aria-label="Opciones del perfil" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-app text-muted transition-colors hover:bg-surface-2 hover:text-main [&::-webkit-details-marker]:hidden">
        <DotsThreeIcon aria-hidden="true" size={24} weight="bold" />
      </summary>
      <div role="group" aria-label="Acciones del perfil" className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-app bg-surface p-1.5 shadow-xl">
        <button type="button" disabled={busy} onClick={() => {
          detailsRef.current?.removeAttribute("open");
          onBlockToggle();
        }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-main hover:bg-surface-2 disabled:opacity-50">
          <ProhibitIcon aria-hidden="true" size={20} />
          {blocked ? "Desbloquear" : "Bloquear"}
        </button>
        <Link href={`/reportar/${encodeURIComponent(userId)}?context=PROFILE`} onClick={() => detailsRef.current?.removeAttribute("open")} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--seat-occupied)] hover:bg-surface-2">
          <FlagIcon aria-hidden="true" size={20} />Reportar perfil
        </Link>
      </div>
    </details>
  );
}
