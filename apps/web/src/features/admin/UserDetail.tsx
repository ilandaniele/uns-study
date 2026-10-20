"use client";

import { manualStudySessionSchema, moderationActionSchema, type AdminUserDto, type ModerationActionType } from "@sala/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiFetch, apiPost, apiPut } from "@/lib/api";
import { buenosAiresLocalToIso } from "./manual-study-session";
import { useMe } from "@/lib/me-store";

const ACTIONS: { type: ModerationActionType; label: string }[] = [
  { type: "WARN", label: "Advertir" },
  { type: "MUTE_CHAT", label: "Silenciar en chat" },
  { type: "RESTRICT_OBSERVATIONS", label: "Restringir observaciones" },
  { type: "SUSPEND", label: "Suspender" },
  { type: "BAN", label: "Banear" },
  { type: "LIFT", label: "Levantar restricciones" },
];

const LIFT_LABEL: Record<string, string> = {
  BANNED: "Desbanear",
  SUSPENDED: "Quitar suspensión",
  MUTE_CHAT: "Quitar silencio",
  RESTRICT_OBSERVATIONS: "Quitar restricción",
};

export function UserDetail({ userId }: { userId: string }) {
  const [user, setUser] = useState<AdminUserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<ModerationActionType>("WARN");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  const [studyStart, setStudyStart] = useState("");
  const [studyMinutes, setStudyMinutes] = useState("");
  const [studyRemove, setStudyRemove] = useState(false);
  const [studyReason, setStudyReason] = useState("");
  const [studySaving, setStudySaving] = useState(false);
  const [studyResult, setStudyResult] = useState<{ ok: boolean; text: string } | null>(null);
  const { me } = useMe();

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

  async function liftRestriction(restrictionId: string, label: string) {
    if (!window.confirm(`¿${label} a este usuario?`)) return;
    setLiftingId(restrictionId);
    try {
      await apiPost(
        `/api/v1/admin/users/${userId}/actions`,
        { type: "LIFT", reason: `${label} desde el panel`, restrictionId },
        moderationActionSchema,
      );
      await load();
    } catch {
      setError("No pudimos levantar la restricción.");
    } finally {
      setLiftingId(null);
    }
  }

  async function submitStudySession(e: FormEvent) {
    e.preventDefault();
    const startedAt = buenosAiresLocalToIso(studyStart);
    if (!startedAt) return;
    setStudySaving(true);
    setStudyResult(null);
    try {
      const created = await apiPost<{ minutes: number }>(
        "/api/v1/admin/study-sessions",
        { userId, startedAt, minutes: (studyRemove ? -1 : 1) * Number(studyMinutes), reason: studyReason.trim() },
        manualStudySessionSchema,
      );
      setStudyResult({ ok: true, text: created.minutes < 0 ? `Se sacaron ${-created.minutes} min` : `Se sumaron ${created.minutes} min` });
      setStudyStart("");
      setStudyMinutes("");
      setStudyReason("");
    } catch (err) {
      setStudyResult({ ok: false, text: err instanceof Error ? err.message : "No pudimos guardar el cambio de horas." });
    } finally {
      setStudySaving(false);
    }
  }

  async function toggleAdmin(grant: boolean) {
    const question = grant ? "¿Hacer admin a este usuario?" : "¿Quitar el rol de admin a este usuario?";
    if (!window.confirm(question)) return;
    setTogglingAdmin(true);
    try {
      if (grant) await apiPut(`/api/v1/admin/users/${userId}/admin`);
      else await apiDelete(`/api/v1/admin/users/${userId}/admin`);
      await load();
    } catch {
      setError("No pudimos cambiar el rol de admin.");
    } finally {
      setTogglingAdmin(false);
    }
  }

  if (error) return <p className="text-sm text-[var(--seat-occupied)]">{error}</p>;
  if (!user) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-t border-app pt-4">
        <h2 className="font-display text-lg font-semibold text-main">{user.name}</h2>
        <p className="text-sm text-muted">{user.email ?? "sin email"}</p>
        <p className="font-mono text-xs text-muted">Miembro desde {new Date(user.createdAt).toLocaleDateString("es-AR")}</p>
        {user.roles.length > 0 ? (
          <p className="mt-2 text-xs font-semibold text-primary">{user.roles.join(", ")}</p>
        ) : null}

        {me?.canManageAdmins && me.user?.id !== user.userId ? (
          <button
            type="button"
            onClick={() => void toggleAdmin(!user.roles.includes("ADMIN"))}
            disabled={togglingAdmin}
            className="mt-3 w-fit rounded-lg border border-app px-3 py-1.5 text-sm font-semibold text-main disabled:opacity-50"
          >
            {user.roles.includes("ADMIN") ? "Quitar admin" : "Hacer admin"}
          </button>
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

        <div className="mt-3 flex flex-col gap-1.5 border-t border-app pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Restricciones activas</p>
          {user.restrictions.length === 0 ? (
            <p className="text-sm text-muted">No tiene ban, suspensión ni otra restricción activa.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.restrictions.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-app bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-main"
                >
                  <span className="font-mono font-semibold text-[var(--seat-occupied)]">{r.type}</span>
                  <span className="text-muted">{r.reason}</span>
                  {r.createdByName ? <span className="text-muted">· por {r.createdByName}</span> : null}
                  <span className="font-mono text-muted">
                    {r.until ? `hasta ${new Date(r.until).toLocaleString("es-AR")}` : "permanente"}
                  </span>
                  {me?.roles.includes("ADMIN") ? (
                    <button
                      type="button"
                      disabled={liftingId !== null}
                      onClick={() => void liftRestriction(r.id, LIFT_LABEL[r.type] ?? "Quitar restricción")}
                      className="ml-1 min-h-8 rounded-md border border-app px-2 font-semibold text-primary hover:bg-surface disabled:opacity-50"
                    >
                      {liftingId === r.id ? "…" : (LIFT_LABEL[r.type] ?? "Quitar")}
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </div>

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

      <form onSubmit={(e) => void submitAction(e)} className="flex flex-col gap-3 border-t border-app pt-4">
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

      {me?.roles.includes("ADMIN") ? (
        <form onSubmit={(e) => void submitStudySession(e)} className="flex flex-col gap-3 border-t border-app pt-4">
          <p className="text-sm font-semibold text-main">Sumar o sacar horas de estudio</p>

          <div role="radiogroup" aria-label="Sumar o sacar" className="flex w-fit gap-1 rounded-lg border border-app p-1">
            {[
              { remove: false, label: "Sumar" },
              { remove: true, label: "Sacar" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={studyRemove === option.remove}
                onClick={() => setStudyRemove(option.remove)}
                className={`min-h-11 rounded-md px-4 text-sm font-semibold ${studyRemove === option.remove ? "bg-primary text-white" : "text-main"}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            {studyRemove ? "Día del que se saca (hora de Buenos Aires)" : "Inicio (hora de Buenos Aires)"}
            <input
              type="datetime-local"
              value={studyStart}
              onChange={(e) => setStudyStart(e.target.value)}
              className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            {studyRemove ? "Minutos a sacar" : "Minutos (más de 720 suma como bonus del día)"}
            <input
              type="number"
              min={1}
              step={1}
              value={studyMinutes}
              onChange={(e) => setStudyMinutes(e.target.value)}
              className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Motivo
            <input
              type="text"
              value={studyReason}
              onChange={(e) => setStudyReason(e.target.value)}
              placeholder="Motivo"
              maxLength={500}
              className="rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />
          </label>

          {studyResult ? (
            <p className={`text-sm ${studyResult.ok ? "text-main" : "text-[var(--seat-occupied)]"}`}>{studyResult.text}</p>
          ) : null}

          <button
            type="submit"
            disabled={studySaving || !studyStart || !studyMinutes || !studyReason.trim()}
            className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {studyRemove ? "Sacar" : "Sumar"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
