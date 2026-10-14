/** "PRO" pill at the top-right corner of its `relative` parent (or in the text flow with `inline`). */
export function ProBadge({ inline = false }: { inline?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none rounded-control bg-primary px-1 py-px text-[9px] font-bold leading-none tracking-wide text-white shadow-sm ${inline ? "" : "absolute -right-1.5 -top-1.5"}`}
    >
      PRO
    </span>
  );
}

/** Accessible name for a locked control, since the badge itself is hidden from assistive tech. */
export function proLabel(label: string, locked: boolean): string {
  return locked ? `${label} (Pro)` : label;
}
