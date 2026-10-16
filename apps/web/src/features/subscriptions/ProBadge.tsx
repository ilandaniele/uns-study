import { CrownSimpleIcon } from "@phosphor-icons/react/dist/ssr";

/** "PRO" pill at the top-right corner of its `relative` parent (or in the text flow with `inline`). */
export function ProBadge({ inline = false }: { inline?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-flex select-none items-center gap-0.5 rounded-full bg-primary px-1.5 py-[3px] text-[9px] font-bold leading-none tracking-wide text-white ${
        inline ? "align-middle" : "absolute -right-1.5 -top-1.5 shadow-sm ring-2 ring-[var(--surface)]"
      }`}
    >
      <CrownSimpleIcon size={10} weight="fill" />
      PRO
    </span>
  );
}

/** Accessible name for a locked control, since the badge itself is hidden from assistive tech. */
export function proLabel(label: string, locked: boolean): string {
  return locked ? `${label} (Pro)` : label;
}
