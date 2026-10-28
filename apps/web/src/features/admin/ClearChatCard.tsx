"use client";

import { useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";

/** Superadmin-only: permanently empties the room chat after an inline confirmation. */
export function ClearChatCard({ roomSlug }: { roomSlug: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { me } = useMe();

  async function clear() {
    setPending(true);
    setError(null);
    try {
      const { count } = await apiFetch<{ count: number }>(`/api/v1/admin/rooms/${roomSlug}/chat/clear`, { method: "POST" });
      setMessage(count === 1 ? "Borramos 1 mensaje." : `Borramos ${count} mensajes.`);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No pudimos vaciar el chat. Probá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (!me?.isSuperAdmin) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">Chat de la sala</h2>
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Se borran todos los mensajes del chat para todos. No se puede deshacer.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void clear()}
              disabled={pending}
              className="min-h-10 rounded-control bg-[var(--seat-occupied)] px-3 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Vaciando…" : "Sí, vaciar el chat"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="min-h-10 rounded-control border border-app px-3 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMessage(null);
              setConfirming(true);
            }}
            className="min-h-10 rounded-control border border-app px-3 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Vaciar chat
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
