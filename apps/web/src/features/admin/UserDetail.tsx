"use client";

import { moderationActionSchema, type AdminUserDto, type ModerationActionType } from "@sala/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiPost } from "@/lib/api";

const ACTIONS: { type: ModerationActionType; label: string }[] = [
  { type: "WARN", label: "Advertir" },
  { type: "MUTE_CHAT", label: "Silenciar en chat" },
  { type: "RESTRICT_OBSERVATIONS", label: "Restringir observaciones" },
  { type: "SUSPEND", label: "Suspender" },
  { type: "BAN", label: "Banear" },
  { type: "LIFT", label: "Levantar restricciones" },
];

export function UserDetail({ userId }: { userId: string }) {
  const [user, setUser] = useState<AdminUserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<ModerationActionType>("WARN");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<AdminUserDto>(`/api/v1/admin/users/${userId}`);
      setUser(dto);
    } catch {
      setError("No pudimos cargar el usuario.");
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load();
  }, [load]);

  async function submitAction(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await apiPost(`/api/v1/admin/users/${userId}/actions`, {
        type,
        reason: reason.trim(),
        until: until ? new Date(until).toISOString() : null,
      }, moderationActionSchema);
      setReason("");
      setUntil("");
      await load();
    } catch {
      setError("No pudimos aplicar la acción.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!user) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[14px] border border-app bg-surface p-4">
        <h2 className="font-display text-lg font-semibold text-main">{user.name}</h2>
        <p className="text-sm text-muted">{user.email ?? "sin email"}</p>
        <p className="font-mono text-xs text-muted">Miembro desde {new Date(user.createdAt).toLocaleDateString("es-AR")}</p>
        {user.roles.length > 0 ? (
          <p className="mt-2 text-xs font-semibold text-primary">{user.roles.join(", ")}</p>
        ) : null}

        {user.reputation ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-app pt-3 text-center sm:grid-cols-4">
            <div>
              <dd className="font-mono text-sm font-semibold text-main">{user.reputation.observationScore.toFixed(2)}</dd>
              <dt className="text-xs text-muted">Observación</dt>
            </div>
            <div>
              <dd className="font-mono text-sm font-semibold text-main">{user.reputation.spamScore.toFixed(2)}</dd>
              <dt className="text-xs text-muted">Spam</dt>
            </div>
            <div>
              <dd className="font-mono text-sm font-semibold text-main">{user.reputation.confirmedObservations}</dd>
              <dt className="text-xs text-muted">Confirmadas</dt>
            </div>
            <div>
              <dd className="font-mono text-sm font-semibold text-main">{user.reputation.rejectedObservations}</dd>
              <dt className="text-xs text-muted">Rechazadas</dt>
            </div>
          </dl>
        ) : null}

        {user.restrictions.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-app pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Restricciones activas</p>
            <div className="flex flex-wrap gap-2">
              {user.restrictions.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-app bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-main"
                >
                  <span className="font-mono font-semibold text-[var(--seat-occupied)]">{r.type}</span>
                  <span className="text-muted">{r.reason}</span>
                  <span className="font-mono text-muted">
                    {r.until ? `hasta ${new Date(r.until).toLocaleString("es-AR")}` : "permanente"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {user.recentSecurityEvents.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-app pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Eventos de seguridad recientes</p>
            <ol className="flex flex-col gap-1 border-l border-app pl-3 font-mono text-xs text-muted">
              {user.recentSecurityEvents.map((event, i) => (
                <li key={i} className="relative before:absolute before:-left-[13px] before:top-1.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--text-faint)]">
                  {new Date(event.createdAt).toLocaleString("es-AR")} · {event.eventType}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <form onSubmit={(e) => void submitAction(e)} className="flex flex-col gap-3 rounded-[14px] border border-app bg-surface p-4">
        <p className="text-sm font-semibold text-main">Aplicar acción de moderación</p>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Tipo de acción
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ModerationActionType)}
            className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          >
            {ACTIONS.map((a) => (
              <option key={a.type} value={a.type}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Motivo
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo"
            maxLength={500}
            className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Vence (opcional, vacío = permanente)
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={saving || !reason.trim()}
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}
