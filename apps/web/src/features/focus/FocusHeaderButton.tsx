"use client";

import { TimerIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProBadge, proLabel } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { useNow } from "@/lib/use-now";
import { useFocus } from "./focus-store";
import { PHASE_LABEL, formatClock, remainingMs } from "./pomodoro";

function LiveClock() {
  const { timer } = useFocus();
  const now = useNow(250).getTime();
  return <>{formatClock(remainingMs(timer, now))}</>;
}

/**
 * Header shortcut to /foco. Idle it is a plain icon button; with a timer going it widens into a
 * small countdown plate so the session stays visible from the room, chat or ranking.
 */
export function FocusHeaderButton() {
  const { timer } = useFocus();
  const pathname = usePathname();
  const { lock } = usePro();
  const locked = lock === "locked";
  // The timer only runs for Pro, so a stale saved session never shows a clock without the plan.
  const active = lock === "unlocked" && timer.status !== "idle";
  const onFocusPage = pathname?.startsWith("/foco");

  // The page itself shows the clock big; a second one in the header would only compete with it.
  if (onFocusPage) return null;
  if (!active) {
    return (
      <Link
        href="/foco"
        aria-label={proLabel("Pomodoro", locked)}
        title="Pomodoro"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-app text-main hover:bg-[var(--surface-2)]"
      >
        <TimerIcon aria-hidden="true" size={20} />
        {locked ? <ProBadge /> : null}
      </Link>
    );
  }

  const isBreak = timer.phase !== "focus";
  const paused = timer.status === "paused";
  return (
    <Link
      href="/foco"
      aria-label={`Pomodoro: ${paused ? "en pausa" : PHASE_LABEL[timer.phase]}`}
      className={`flex h-11 shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-main hover:bg-[var(--surface-2)] ${
        isBreak || paused ? "border-app" : "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${paused ? "bg-[var(--border-strong)]" : isBreak ? "bg-[var(--text-faint)]" : "bg-primary"}`}
      />
      <span className={`font-mono text-sm font-semibold ${paused ? "text-muted" : ""}`}>
        <LiveClock />
      </span>
    </Link>
  );
}
