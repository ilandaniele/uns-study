"use client";

import type { Page } from "@sala/contracts";
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

  if (error) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!page) return <p className="text-sm text-muted">Cargando…</p>;

  if (page.items.length === 0) {
    return (
      <p className="rounded-[14px] border border-app bg-surface px-4 py-6 text-center text-sm text-muted">
        No hay eventos registrados todavía.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3 rounded-[14px] border border-app bg-surface p-4">
      {page.items.map((entry) => (
        <li key={entry.id} className="relative border-l border-app pl-3 before:absolute before:-left-[5px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-[var(--text-faint)]">
          <p className="text-sm font-medium text-main">{entry.action}</p>
          <p className="font-mono text-xs text-muted">
            {new Date(entry.createdAt).toLocaleString("es-AR")} · {entry.actorId ?? "sistema"}
            {entry.targetUserId ? ` → ${entry.targetUserId}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
