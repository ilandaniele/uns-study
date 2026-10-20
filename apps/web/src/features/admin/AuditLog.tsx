"use client";

import type { Page } from "@sala/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AuditEntryDto } from "./types";

const ACTION_LABEL: Record<string, string> = {
  WARN: "Advertencia",
  MUTE_CHAT: "Silencio en chat",
  RESTRICT_OBSERVATIONS: "Restricción de observaciones",
  SUSPEND: "Suspensión",
  BAN: "Ban",
  LIFT: "Restricción levantada",
  STUDY_TIME_CREDITED: "Horas de estudio ajustadas",
  REPORT_STATUS_CHANGED: "Reporte actualizado",
  ACCOUNT_DELETED: "Cuenta eliminada",
  SHIELDED: "Blindado",
  UNSHIELDED: "Desblindado",
};

function reasonOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "reason" in metadata) {
    const reason = (metadata as { reason: unknown }).reason;
    return typeof reason === "string" && reason.trim() ? reason : null;
  }
  return null;
}

/** The moderation log, newest first. With `userId` it shows only the actions taken on that user. */
export function AuditLog({ userId }: { userId?: string } = {}) {
  const [items, setItems] = useState<AuditEntryDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (userId) params.set("userId", userId);
      const query = params.toString();
      return apiFetch<Page<AuditEntryDto>>(`/api/v1/admin/audit${query ? `?${query}` : ""}`);
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(null)
      .then((dto) => {
        if (cancelled) return;
        setItems(dto.items);
        setNextCursor(dto.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar la auditoría.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const dto = await fetchPage(nextCursor);
      setItems((prev) => [...(prev ?? []), ...dto.items]);
      setNextCursor(dto.nextCursor);
    } catch {
      setError("No pudimos cargar más eventos.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !items) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!items) return <p className="text-sm text-muted">Cargando…</p>;

  if (items.length === 0) {
    return (
      <p className="border-y border-app px-4 py-6 text-center text-sm text-muted">
        {userId ? "No hay acciones registradas sobre este usuario." : "No hay eventos registrados todavía."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3 border-t border-app pt-4">
        {items.map((entry) => {
          const reason = reasonOf(entry.metadata);
          return (
            <li key={entry.id} className="relative border-l border-app pl-3 before:absolute before:-left-[5px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-[var(--text-faint)]">
              <p className="text-sm font-medium text-main">
                {ACTION_LABEL[entry.action] ?? entry.action}
                {!userId && entry.targetUserId ? (
                  <>
                    {" · "}
                    <Link href={`/admin/users/${entry.targetUserId}`} className="text-primary hover:underline">
                      {entry.targetName ?? entry.targetUserId}
                    </Link>
                  </>
                ) : null}
              </p>
              {reason ? <p className="text-xs text-muted">{reason}</p> : null}
              <p className="font-mono text-xs text-muted">
                {new Date(entry.createdAt).toLocaleString("es-AR")} · por {entry.actorName ?? entry.actorId ?? "sistema"}
              </p>
            </li>
          );
        })}
      </ol>
      {error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}
      {nextCursor ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="min-h-11 w-fit rounded-lg border border-app px-4 text-sm font-semibold text-main hover:bg-surface disabled:opacity-50"
        >
          {loadingMore ? "Cargando…" : "Ver más"}
        </button>
      ) : null}
    </div>
  );
}
