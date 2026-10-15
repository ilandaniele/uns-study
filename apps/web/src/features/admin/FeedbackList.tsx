"use client";

import type { AdminFeedbackDto, AdminFeedbackListDto, FeedbackStatus } from "@sala/contracts";
import { feedbackStatusSchema } from "@sala/contracts";
import { useEffect, useState } from "react";
import { feedbackCategoryLabel } from "@/features/feedback/categories";
import { apiFetch, apiPatch } from "@/lib/api";

const FILTERS: { status: FeedbackStatus; label: string }[] = [
  { status: "OPEN", label: "Abiertas" },
  { status: "RESOLVED", label: "Resueltas" },
];

export function FeedbackList() {
  const [status, setStatus] = useState<FeedbackStatus>("OPEN");
  const [items, setItems] = useState<AdminFeedbackDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AdminFeedbackListDto>(`/api/v1/admin/feedback?status=${status}`)
      .then((dto) => {
        if (!cancelled) {
          setItems(dto.items);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar las sugerencias.");
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  function selectStatus(next: FeedbackStatus) {
    if (next === status) return;
    setItems(null);
    setError(null);
    setStatus(next);
  }

  async function toggle(item: AdminFeedbackDto) {
    const next: FeedbackStatus = item.status === "OPEN" ? "RESOLVED" : "OPEN";
    setBusyId(item.id);
    setError(null);
    try {
      await apiPatch(`/api/v1/admin/feedback/${item.id}`, { status: next }, feedbackStatusSchema);
      // The item no longer belongs to the current filter, so drop it from the list.
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
    } catch {
      setError("No pudimos actualizar el mensaje. Probá de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-control border border-app bg-[var(--surface-2)] p-1 text-sm font-medium">
        {FILTERS.map((f) => (
          <button
            key={f.status}
            type="button"
            onClick={() => selectStatus(f.status)}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              f.status === status ? "bg-primary text-white" : "text-muted hover:text-main"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {items?.map((item) => (
          <article key={item.id} className="flex flex-col gap-1.5 border-t border-app pt-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-main">{feedbackCategoryLabel(item.category)}</span>
              <span className="font-mono text-xs text-muted">{new Date(item.createdAt).toLocaleString("es-AR")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-muted">
              <span>{item.sender?.name ?? "Anónimo"}</span>
              {item.contactEmail ? (
                <a href={`mailto:${item.contactEmail}`} className="break-all text-primary underline underline-offset-2">
                  {item.contactEmail}
                </a>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap break-words text-main [overflow-wrap:anywhere]">{item.message}</p>
            <button
              type="button"
              onClick={() => void toggle(item)}
              disabled={busyId === item.id}
              className="mt-1 min-h-11 self-start rounded-control border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-surface-2 disabled:opacity-50"
            >
              {item.status === "OPEN" ? "Marcar resuelta" : "Reabrir"}
            </button>
          </article>
        ))}
        {items && items.length === 0 ? (
          <p className="border-y border-app px-4 py-6 text-center text-sm text-muted">
            No hay mensajes con este estado.
          </p>
        ) : null}
      </div>
    </div>
  );
}
