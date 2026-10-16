"use client";

import { weeklyGoalRequestSchema, type WeeklyGoalDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { apiFetch, apiPut, isProRequired } from "@/features/pro/pro-api";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { GOAL_HOUR_OPTIONS, formatHM, goalToHours, progressRatio } from "./weekly-goal";

/** Toggle switch matching `NotificationSettings`'s look. */
function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-app transition-colors before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-surface-2"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Pro: weekly study goal, progress bar and Sunday reminder toggle, on /perfil. */
export function WeeklyGoalCard() {
  const { lock } = usePro();
  const [goal, setGoal] = useState<WeeklyGoalDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lock !== "unlocked") return;
    let cancelled = false;
    apiFetch<WeeklyGoalDto>("/api/v1/me/weekly-goal")
      .then((dto) => {
        if (!cancelled) setGoal(dto);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar tu meta. Probá de nuevo más tarde.");
      });
    return () => {
      cancelled = true;
    };
  }, [lock]);

  async function save(input: { minutes: number | null; reminderEnabled?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      setGoal(await apiPut<WeeklyGoalDto>("/api/v1/me/weekly-goal", input, weeklyGoalRequestSchema));
    } catch (err) {
      if (isProRequired(err)) openProUpsell("weekly_goal");
      else setError("No pudimos guardar la meta. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (lock === "unknown") return null;

  if (lock === "locked") {
    return (
      <div className="mb-4 rounded-control border border-app bg-surface-2 p-3">
        <h3 className="text-sm font-semibold text-main">Meta semanal</h3>
        <p className="mt-1 text-xs text-muted">Fijate una meta de horas por semana y seguí tu avance, con un recordatorio opcional.</p>
        <button
          type="button"
          onClick={() => openProUpsell("weekly_goal")}
          className="relative mt-2 rounded-control border border-app bg-surface px-3 py-1.5 text-sm font-semibold text-main"
        >
          Fijar una meta
          <ProBadge />
        </button>
      </div>
    );
  }

  const ratio = progressRatio(goal?.studiedMinutes ?? 0, goal?.goalMinutes ?? null);
  const percent = Math.round(ratio * 100);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-control border border-app bg-surface-2 p-3">
      <h3 className="text-sm font-semibold text-main">Meta semanal</h3>
      {goal === null ? (
        error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted">Cargando…</p>
        )
      ) : (
        <>
          {goal.goalMinutes !== null ? (
            <div className="flex flex-col gap-1">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Avance de la meta semanal"
                className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]"
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-muted">
                {formatHM(goal.studiedMinutes)} de {formatHM(goal.goalMinutes)} esta semana
                {ratio >= 1 ? " · ¡Meta cumplida!" : ""}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">Todavía no te fijaste una meta. Elegí cuántas horas querés estudiar por semana.</p>
          )}

          <label className="flex items-center justify-between gap-3 text-sm text-main">
            <span>Horas por semana</span>
            <select
              value={goal.goalMinutes === null ? "" : goalToHours(goal.goalMinutes)}
              disabled={saving}
              onChange={(e) => void save({ minutes: e.target.value === "" ? null : Number(e.target.value) * 60 })}
              className="min-h-9 rounded-control border border-app bg-surface px-2 text-sm text-main disabled:opacity-50"
            >
              <option value="">Sin meta</option>
              {GOAL_HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </label>

          {goal.goalMinutes !== null ? (
            <div className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium text-main">Recordatorio del domingo</span>
                <span className="block text-xs text-muted">Te avisamos a las 18 si todavía te falta para llegar a tu meta.</span>
              </span>
              <Switch
                checked={goal.reminderEnabled}
                disabled={saving}
                label="Recordatorio del domingo"
                onChange={(v) => void save({ minutes: goal.goalMinutes, reminderEnabled: v })}
              />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
