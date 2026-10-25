"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNow } from "@/lib/use-now";
import { useFocus } from "./focus-store";
import { PHASE_LABEL, formatClock, remainingMs } from "./pomodoro";

function LiveClock() {
  const { timer } = useFocus();
  const now = useNow(250).getTime();
  const left = remainingMs(timer, now);
  const clock = formatClock(left);
  return <>
    <span className="max-[400px]:hidden">{clock}</span>
    <span className="hidden max-[400px]:inline">{left >= 3_600_000 ? `${Math.ceil(left / 60_000)}m` : clock}</span>
  </>;
}

/**
 * A running countdown remains visible across pages. The main navigation provides the idle shortcut.
 */
export function FocusHeaderButton() {
  const { timer } = useFocus();
  const pathname = usePathname();
  const active = timer.status !== "idle";
  const onFocusPage = pathname?.startsWith("/foco");

  // The page itself shows the clock big; a second one in the header would only compete with it.
  if (onFocusPage) return null;
  if (!active) return null;

  const isBreak = timer.phase !== "focus";
  const paused = timer.status === "paused";
  return (
    <Link
      href="/foco"
      aria-label={`Pomodoro: ${paused ? "en pausa" : PHASE_LABEL[timer.phase]}`}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control border px-2.5 text-main hover:bg-[var(--surface-2)] max-[400px]:gap-0 max-[400px]:px-1 ${
        isBreak || paused ? "border-app" : "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full max-[400px]:hidden ${paused ? "bg-[var(--border-strong)]" : isBreak ? "bg-[var(--text-faint)]" : "bg-primary"}`}
      />
      <span className={`font-mono text-sm font-semibold max-[400px]:text-[12px] ${paused ? "text-muted" : ""}`}>
        <LiveClock />
      </span>
    </Link>
  );
}
