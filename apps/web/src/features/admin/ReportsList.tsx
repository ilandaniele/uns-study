"use client";

import type { AdminReportDto, Page } from "@sala/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { REPORT_REASON_LABELS, REPORT_STATUSES, REPORT_STATUS_LABELS } from "./reports-labels";
import { ReportStatusPill } from "./ReportStatusPill";

export function ReportsList() {
  const [status, setStatus] = useState<string>("OPEN");
  const [page, setPage] = useState<Page<AdminReportDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Page<AdminReportDto>>(`/api/v1/admin/reports?status=${status}`)
      .then((dto) => {
        if (!cancelled) setPage(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar los reportes.");
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-app bg-[var(--surface-2)] p-1 text-sm font-medium">
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              s === status ? "bg-primary text-white" : "text-muted hover:text-main"
            }`}
          >
            {REPORT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {page?.items.map((report) => (
          <Link
            key={report.id}
            href={`/admin/reports/${report.id}`}
            className="flex flex-col gap-1.5 rounded-[14px] border border-app bg-surface p-4 text-sm hover:bg-[var(--surface-2)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-main">{REPORT_REASON_LABELS[report.reason]}</span>
              <ReportStatusPill status={report.status} />
            </div>
            <span className="text-muted">
              {report.reporter?.name ?? "Cuenta eliminada"} → {report.reported?.name ?? "Cuenta eliminada"}
            </span>
            <span className="font-mono text-xs text-muted">{new Date(report.createdAt).toLocaleString("es-AR")}</span>
          </Link>
        ))}
        {page && page.items.length === 0 ? (
          <p className="rounded-[14px] border border-app bg-surface px-4 py-6 text-center text-sm text-muted">
            No hay reportes con este estado.
          </p>
        ) : null}
      </div>
    </div>
  );
}
