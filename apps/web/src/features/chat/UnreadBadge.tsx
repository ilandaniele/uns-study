import { formatUnread } from "./unread";

/** Unread count pill (counts above 99 collapse to "99+"). Renders nothing for 0. */
export function UnreadBadge({ count, size = "md", className = "" }: { count: number; size?: "sm" | "md"; className?: string }) {
  if (count <= 0) return null;
  const dimensions = size === "sm" ? "min-w-[18px] px-1 text-[11px] leading-[18px]" : "min-w-5 px-1.5 text-xs leading-5";
  return (
    <span
      className={`inline-block rounded-full bg-[var(--badge-bg)] text-center font-bold tabular-nums text-[var(--badge-fg)] ${dimensions} ${className}`}
    >
      {formatUnread(count)}
    </span>
  );
}
