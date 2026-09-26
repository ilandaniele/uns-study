import type { ReportReason } from "@uns/contracts";

/** Spanish labels for the report reason `<select>`, in display order. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam",
  HARASSMENT: "Acoso",
  INAPPROPRIATE_BEHAVIOR: "Comportamiento inapropiado",
  IMPERSONATION: "Suplantación de identidad",
  SEAT_TROLLING: "Marcar lugares libres/ocupados a propósito",
  OFFENSIVE_CONTENT: "Contenido ofensivo",
  OTHER: "Otro",
};

export const REPORT_REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASON_LABELS[reason];
}
