"use client";

import type { AdminUserDto, ModerationActionType } from "@uns/contracts";
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
      });
      setReason("");
      setUntil("");
      await load();
    } catch {
      setError("No pudimos aplicar la acción.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!user) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">{user.name}</h2>
        <p className="text-sm text-slate-500">{user.email}</p>
        <p className="text-xs text-slate-400">Miembro desde {new Date(user.createdAt).toLocaleDateString("es-AR")}</p>
        {user.roles.length > 0 ? <p className="mt-2 text-xs font-semibold text-primary">{user.roles.join(", ")}</p> : null}

        {user.reputation ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
            <span>Observación: {user.reputation.observationScore.toFixed(2)}</span>
            <span>Spam: {user.reputation.spamScore.toFixed(2)}</span>
            <span>Confirmadas: {user.reputation.confirmedObservations}</span>
            <span>Rechazadas: {user.reputation.rejectedObservations}</span>
          </div>
        ) : null}

        {user.restrictions.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase text-slate-400">Restricciones activas</p>
            {user.restrictions.map((r) => (
              <p key={r.id} className="text-sm text-slate-700">
                {r.type} — {r.reason} {r.until ? `(hasta ${new Date(r.until).toLocaleString("es-AR")})` : "(permanente)"}
              </p>
            ))}
          </div>
        ) : null}

        {user.recentSecurityEvents.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase text-slate-400">Eventos de seguridad recientes</p>
            {user.recentSecurityEvents.map((event, i) => (
              <p key={i} className="text-xs text-slate-500">
                {event.eventType} · {new Date(event.createdAt).toLocaleString("es-AR")}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <form onSubmit={(e) => void submitAction(e)} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-700">Aplicar acción de moderación</p>
        <select value={type} onChange={(e) => setType(e.target.value as ModerationActionType)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {ACTIONS.map((a) => (
            <option key={a.type} value={a.type}>
              {a.label}
            </option>
          ))}
        </select>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo"
          maxLength={500}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Vence (opcional, vacío = permanente)
          <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" disabled={saving || !reason.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Aplicar
        </button>
      </form>
    </div>
  );
}
