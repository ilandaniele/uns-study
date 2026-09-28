"use client";

import { CaretDownIcon, CheckIcon, UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMyProfile } from "@/features/profile/useMyProfile";

/**
 * Step-by-step guide for appearing with a name and photo instead of "Usuario anónimo".
 * Renders nothing once the caller already shows a name and a photo. `sidebar` is always
 * expanded (desktop side column); `inline` is a collapsible card, closed by default (mobile).
 */
export function IdentityHelp({ variant = "inline" }: { variant?: "inline" | "sidebar" }) {
  const { profile, privacy, loading } = useMyProfile();
  const [toggled, setToggled] = useState<boolean | null>(null);

  if (loading || !profile || !privacy) return null;

  const anonymous = profile.identityMode === "HIDDEN";
  const photoHidden = !privacy.showAvatar || !profile.avatarUrl;
  const needsSetup = anonymous || photoHidden;
  if (!needsSetup) return null;
  const sidebar = variant === "sidebar";
  const open = sidebar || (toggled ?? false);

  const title = anonymous
    ? "Estás apareciendo como “Usuario anónimo”"
    : "Tu foto no se muestra en el chat";

  return (
    <section className={sidebar ? "rounded-2xl border border-app bg-surface" : "mx-3 mt-2 rounded-2xl border border-app bg-surface"}>
      {sidebar ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <UserCircleIcon size={20} className="text-primary" aria-hidden="true" />
          <h2 className="flex-1 text-sm font-semibold text-main">{title}</h2>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setToggled(!open)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <UserCircleIcon size={20} className="text-primary" aria-hidden="true" />
          <span className="flex-1 text-sm font-medium text-main">{title}</span>
          <CaretDownIcon size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
      {open ? (
        <div className="border-t border-app px-3 pb-3 pt-2">
          <ol className="flex flex-col gap-1.5 text-sm text-muted">
            <Step n={1} done={false}>
              Entrá a <Link href="/perfil" className="font-medium text-primary hover:underline">Perfil</Link>.
            </Step>
            <Step n={2} done={!anonymous}>
              En “¿Cómo te ven otras personas?” elegí nombre, apodo o nombre completo (no “Oculto”), completá ese dato y tocá Guardar.
            </Step>
            <Step n={3} done={Boolean(profile.avatarUrl)}>
              En “Foto de perfil” subí una foto o usá la de tu cuenta de Google.
            </Step>
            <Step n={4} done={privacy.showAvatar}>
              En Privacidad activá “Mostrar foto de perfil”.
            </Step>
          </ol>
          <p className="mt-2 text-xs text-muted">Los cambios se ven en tus mensajes nuevos y en los anteriores al recargar.</p>
          <Link
            href="/perfil"
            className="mt-3 inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Ir a mi perfil
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function Step({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          done ? "bg-[var(--seat-free)] text-white" : "bg-[var(--surface-2)] text-main"
        }`}
        aria-label={done ? `Paso ${n}, listo` : `Paso ${n}`}
      >
        {done ? <CheckIcon size={12} weight="bold" aria-hidden="true" /> : n}
      </span>
      <span className={done ? "line-through decoration-1 opacity-70" : ""}>{children}</span>
    </li>
  );
}
