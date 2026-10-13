import type { SeatDto } from "@sala/contracts";
import type { ReactNode } from "react";
import { statusLabel } from "./format";

export function StatusPill({ status, isMySeat }: { status: SeatDto["status"]; isMySeat: boolean }) {
  const color = isMySeat
    ? "var(--seat-mine)"
    : { FREE: "var(--seat-free)", OCCUPIED: "var(--seat-occupied)", UNCERTAIN: "var(--seat-uncertain)", SAVED: "var(--seat-saved)", UNKNOWN: "var(--seat-unknown)" }[
        status
      ];
  return (
    <p className="mt-2 flex items-center gap-2 whitespace-nowrap text-sm font-bold text-main">
      <span aria-hidden className="inline-block h-3 w-3 rounded-xs" style={{ backgroundColor: color }} />
      {isMySeat ? "Tu lugar" : statusLabel(status)}
    </p>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  hint,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Small secondary text inside the button (e.g. "hasta las 18:40"). */
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-control bg-primary px-4 py-3 text-base font-bold text-white transition-[background-color,transform] hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50"
    >
      {children}
      {hint ? <span className="text-[13px] font-medium tabular-nums text-white/85 max-[359px]:hidden">· {hint}</span> : null}
    </button>
  );
}

export function ObservationChip({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "free" | "occupied" | "saved";
}) {
  const color = { free: "var(--seat-free)", occupied: "var(--seat-occupied)", saved: "var(--seat-saved)" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-control bg-surface-2 px-1 text-center text-[13px] font-semibold leading-tight [text-wrap:balance] text-main transition-transform active:scale-[0.96] disabled:opacity-50"
    >
      {/* Status color lives in the dot, not the text, so every label keeps full contrast. */}
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </button>
  );
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${Math.floor(hours)} h ${minutes % 60}`;
}

export function QuietDangerButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 w-full rounded-control px-4 py-2.5 text-sm font-semibold text-[var(--seat-occupied)] hover:bg-[var(--surface-2)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
