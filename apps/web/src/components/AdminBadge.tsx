import type { ReactNode } from "react";

/** Gold "Admin" pill, absolutely positioned on the bottom edge of the nearest `relative` avatar wrapper. */
export function AdminBadge({ size = 40, edge = "bottom" }: { size?: number; edge?: "bottom" | "top" }) {
  const fontSize = Math.max(7, Math.round(size * 0.24));
  return (
    <span
      role="img"
      aria-label="Administrador"
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${edge === "top" ? "top-0 -translate-y-1/3" : "bottom-0 translate-y-1/3"} whitespace-nowrap rounded-xs border border-amber-600 bg-amber-300 font-extrabold uppercase leading-none tracking-wide text-amber-950 dark:border-amber-300`}
      style={{ fontSize, padding: `${Math.max(1, Math.round(fontSize * 0.2))}px ${Math.max(3, Math.round(fontSize * 0.45))}px` }}
    >
      Admin
    </span>
  );
}

/** Gold "Admin" pill that sits inline with text (no absolute positioning). */
export function AdminTag() {
  return (
    <span className="inline-block shrink-0 whitespace-nowrap rounded-xs border border-amber-600 bg-amber-300 px-2 py-0.5 text-[11px] font-extrabold uppercase leading-none tracking-wide text-amber-950 dark:border-amber-300">
      Admin
    </span>
  );
}

/** Wraps an avatar so the gold badge can sit over its bottom edge; renders `children` untouched when `show` is false. */
export function WithAdminBadge({ show, size = 40, children }: { show?: boolean; size?: number; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <AdminBadge size={size} />
    </span>
  );
}
