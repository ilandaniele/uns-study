"use client";

import type { AdminReportDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, REPORT_STATUSES } from "./reports-labels";
import { ReportStatusPill } from "./ReportStatusPill";
import { PublicModerationActions } from "./PublicModerationActions";

export function ReportDetail({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<AdminReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    apiFetch<AdminReportDto>(`/api/v1/admin/reports/${reportId}`)
      .then((dto) => {
        if (!cancelled) setReport(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar el reporte.");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function changeStatus(status: string) {
    setSaving(true);
    try {
      const updated = await apiFetch<AdminReportDto>(`/api/v1/admin/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setReport(updated);
    } catch {
      setError("No pudimos actualizar el estado.");
    } finally {
      setSaving(false);
    }
  }

  async function viewAttachment(attachmentId: string) {
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/v1/admin/reports/${reportId}/attachments/${attachmentId}/url`,
      );
      setAttachmentUrls((prev) => ({ ...prev, [attachmentId]: url }));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("No pudimos obtener la evidencia.");
    }
  }

  if (error) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!report) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4 border-t border-app pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-main">{REPORT_REASON_LABELS[report.reason]}</h2>
            <p className="text-sm text-muted">
              {report.reporter?.name ?? "Cuenta eliminada"}{report.reporter?.email ? ` (${report.reporter.email})` : ""} reportó a{" "}
              {report.reported?.name ?? "Cuenta eliminada"}{report.reported?.email ? ` (${report.reported.email})` : ""}
            </p>
            <p className="font-mono text-xs text-muted">
              {report.context} · {new Date(report.createdAt).toLocaleString("es-AR")}
            </p>
          </div>
          <ReportStatusPill status={report.status} />
        </div>

        {report.description ? <p className="whitespace-pre-wrap text-sm text-main">{report.description}</p> : null}
        {report.reported ? <PublicModerationActions userId={report.reported.userId} displayName={report.reported.name}/> : null}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 border-t border-app pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evidencia</p>
          {report.attachments.length > 0 ? (
            report.attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => void viewAttachment(attachment.id)}
                className="rounded-lg border border-app px-3 py-1.5 text-left text-sm text-main hover:bg-[var(--surface-2)]"
              >
                {attachment.contentType} · {(attachment.sizeBytes / 1024).toFixed(0)} KB
                {attachmentUrls[attachment.id] ? " (abierta)" : ""}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted">Sin evidencia adjunta.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-app pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Estado: {REPORT_STATUS_LABELS[report.status] ?? report.status}
          </p>
          <div className="flex flex-wrap gap-2">
            {REPORT_STATUSES.filter((s) => s !== report.status).map((s) => (
              <button
                key={s}
                type="button"
                disabled={saving}
                onClick={() => void changeStatus(s)}
                className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-muted hover:bg-[var(--surface-2)] hover:text-main disabled:opacity-50"
              >
                Marcar {REPORT_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
