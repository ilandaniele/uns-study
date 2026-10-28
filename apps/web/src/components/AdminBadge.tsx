import type { ReactNode } from "react";
import type { AdminBadgeLevel } from "@sala/contracts";

const adminColors = "rounded-xs border-amber-600 bg-amber-300 text-amber-950 dark:border-amber-300";
const superColors = "rounded-full border-violet-400 bg-violet-700 text-white dark:border-violet-300";

/** Staff badge on the avatar edge: gold Admin or violet Superadmin. */
export function AdminBadge({ size = 40, edge = "bottom", kind = true }: { size?: number; edge?: "bottom" | "top"; kind?: AdminBadgeLevel }) {
  const superAdmin = kind === "SUPERADMIN";
  const fontSize = Math.max(7, Math.round(size * 0.24));
  return (
    <span
      role="img"
      aria-label={superAdmin ? "Superadministrador" : "Administrador"}
      title={superAdmin ? "Superadmin · creador y desarrollador" : "Administrador de la sala · colaboración y moderación"}
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${edge === "top" ? "top-0 -translate-y-1/3" : "bottom-0 translate-y-1/3"} whitespace-nowrap border font-extrabold uppercase leading-none tracking-wide ${superAdmin ? superColors : adminColors}`}
      style={{ fontSize, padding: `${Math.max(1, Math.round(fontSize * 0.2))}px ${Math.max(3, Math.round(fontSize * 0.45))}px` }}
    >
      {superAdmin ? "Dev" : "Admin"}
    </span>
  );
}

/** Full staff label that sits inline with text (no absolute positioning). */
export function AdminTag({ kind = true }: { kind?: AdminBadgeLevel }) {
  const superAdmin = kind === "SUPERADMIN";
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap border px-2 py-0.5 text-[11px] font-extrabold uppercase leading-none tracking-wide ${superAdmin ? superColors : adminColors}`}>
      {superAdmin ? "Creador · Superadmin" : "Admin de la sala"}
    </span>
  );
}

/** Wraps an avatar so its staff badge can sit over the bottom edge. */
export function WithAdminBadge({ show, size = 40, children }: { show?: AdminBadgeLevel; size?: number; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <AdminBadge size={size} kind={show} />
    </span>
  );
}
