"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CrownIcon, LeafIcon, SparkleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { COLLABORATION_REWARD_PRO_DAYS, type CollaborationRewardDto } from "@sala/contracts";
import { useFocusTrap } from "@/lib/useFocusTrap";

export function CollaborationRewardDialog({ reward, onClose }: { reward: CollaborationRewardDto; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const title = useId();
  useFocusTrap(panel, { onEscape: onClose });
  const expires = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(reward.proExpiresAt));
  return createPortal(<div className="backdrop-enter motion-reduce:animate-none! fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto overscroll-contain bg-black/55 p-3 sm:items-center sm:p-6" onClick={onClose}>
    <div ref={panel} data-collaboration-reward-dialog role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} onClick={event => event.stopPropagation()} className="dialog-enter motion-reduce:animate-none! relative my-auto w-full max-w-md rounded-[28px] border border-primary/30 bg-surface p-6 text-center text-main shadow-2xl outline-none sm:p-8">
      <button type="button" onClick={onClose} aria-label="Cerrar recompensa" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2"><XIcon size={20} aria-hidden="true" /></button>
      <span className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary"><SparkleIcon size={42} weight="duotone" aria-hidden="true" /></span>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Tu ayuda tiene premio</p>
      <h2 id={title} className="mt-2 text-2xl font-bold tracking-tight">¡Gracias por cuidar la sala!</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">Actualizaste {reward.places} lugares distintos en un día. Ya tenés tu recompensa:</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-primary/10 p-4"><CrownIcon className="mx-auto text-primary" size={28} weight="duotone" aria-hidden="true" /><p className="mt-2 text-lg font-bold">{COLLABORATION_REWARD_PRO_DAYS} días Pro</p><p className="mt-1 text-xs text-muted">Gratis, por colaborar</p></div>
        <div className="rounded-2xl bg-surface-2 p-4"><LeafIcon className="mx-auto text-primary" size={28} weight="duotone" aria-hidden="true" /><p className="mt-2 text-lg font-bold">{reward.seeds} semillas</p><p className="mt-1 text-xs text-muted">Ya están en tu jardín</p></div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">Tu semana Pro de regalo vence el {expires}. No requiere tarjeta ni se renueva con cobros.</p>
      <Link href="/jardin" onClick={onClose} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-white hover:bg-primary-dark"><LeafIcon size={19} aria-hidden="true" />Ir a mi jardín</Link>
      <button type="button" onClick={onClose} className="mt-2 min-h-11 w-full rounded-full text-sm font-semibold text-muted hover:text-main">Seguir colaborando</button>
    </div>
  </div>, document.body);
}
