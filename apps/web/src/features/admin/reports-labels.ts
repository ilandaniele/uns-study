import type { ReportReason } from "@uns/contracts";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam",
  HARASSMENT: "Acoso",
  INAPPROPRIATE_BEHAVIOR: "Comportamiento inapropiado",
  IMPERSONATION: "Suplantación de identidad",
  SEAT_TROLLING: "Trolleo de lugares",
  OFFENSIVE_CONTENT: "Contenido ofensivo",
  OTHER: "Otro",
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  UNDER_REVIEW: "En revisión",
  RESOLVED: "Resuelto",
  DISMISSED: "Descartado",
};

export const REPORT_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const;
