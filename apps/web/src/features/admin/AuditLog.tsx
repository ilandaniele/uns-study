"use client";

import type { Page } from "@uns/contracts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AuditEntryDto } from "./types";

export function AuditLog() {
  const [page, setPage] = useState<Page<AuditEntryDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Page<AuditEntryDto>>("/api/v1/admin/audit")
      .then((dto) => {
        if (!cancelled) setPage(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar la auditoría.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!page) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {page.items.map((entry) => (
        <div key={entry.id} className="px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">{entry.action}</p>
          <p className="text-xs text-slate-500">
            {entry.actorId ?? "sistema"} {entry.targetUserId ? `→ ${entry.targetUserId}` : ""} ·{" "}
            {new Date(entry.createdAt).toLocaleString("es-AR")}
          </p>
        </div>
      ))}
      {page.items.length === 0 ? <p className="px-4 py-3 text-sm text-slate-400">No hay eventos registrados.</p> : null}
    </div>
  );
}
