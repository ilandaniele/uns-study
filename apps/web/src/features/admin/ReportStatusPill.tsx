import { REPORT_STATUS_COLORS, REPORT_STATUS_LABELS } from "./reports-labels";

/** Colored status badge shared by the reports queue and the report detail view. */
export function ReportStatusPill({ status }: { status: string }) {
  const color = REPORT_STATUS_COLORS[status] ?? "var(--text-faint)";
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-app px-2.5 py-1 text-xs font-semibold"
      style={{ color }}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {REPORT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
