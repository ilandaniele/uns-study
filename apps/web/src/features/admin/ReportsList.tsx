"use client";

import type { AdminReportDto, Page } from "@uns/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, REPORT_STATUSES } from "./reports-labels";

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
      <div className="flex flex-wrap gap-2">
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={
              s === status
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            {REPORT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {page?.items.map((report) => (
          <Link
            key={report.id}
            href={`/admin/reports/${report.id}`}
            className="flex flex-col gap-1 px-4 py-3 text-sm hover:bg-slate-50"
          >
            <span className="font-semibold text-slate-800">{REPORT_REASON_LABELS[report.reason]}</span>
            <span className="text-slate-500">
              {report.reporter?.name ?? "Usuario eliminado"} → {report.reported?.name ?? "Usuario eliminado"} ·{" "}
              {new Date(report.createdAt).toLocaleString("es-AR")}
            </span>
          </Link>
        ))}
        {page && page.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No hay reportes con este estado.</p>
        ) : null}
      </div>
    </div>
  );
}
