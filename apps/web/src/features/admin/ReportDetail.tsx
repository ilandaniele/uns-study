"use client";

import type { AdminReportDto } from "@uns/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, REPORT_STATUSES } from "./reports-labels";

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!report) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{REPORT_REASON_LABELS[report.reason]}</h2>
        <p className="text-sm text-slate-500">
          {report.reporter?.name ?? "Usuario eliminado"} ({report.reporter?.email ?? "—"}) reportó a{" "}
          {report.reported?.name ?? "Usuario eliminado"} ({report.reported?.email ?? "—"})
        </p>
        <p className="text-xs text-slate-400">
          {report.context} · {new Date(report.createdAt).toLocaleString("es-AR")}
        </p>
      </div>

      {report.description ? <p className="whitespace-pre-wrap text-sm text-slate-700">{report.description}</p> : null}

      {report.attachments.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase text-slate-400">Evidencia</p>
          {report.attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => void viewAttachment(attachment.id)}
              className="w-fit rounded-lg border border-slate-300 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {attachment.contentType} · {(attachment.sizeBytes / 1024).toFixed(0)} KB
              {attachmentUrls[attachment.id] ? " (abierta)" : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Estado: {REPORT_STATUS_LABELS[report.status] ?? report.status}</span>
        {REPORT_STATUSES.filter((s) => s !== report.status).map((s) => (
          <button
            key={s}
            type="button"
            disabled={saving}
            onClick={() => void changeStatus(s)}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Marcar {REPORT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
