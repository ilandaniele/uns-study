"use client";

import { streakFreezeRequestSchema, type BadgeDto, type BadgesDto, type StreakDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { apiFetch, apiPost, isProRequired } from "@/features/pro/pro-api";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { badgeProgressText, freezeBlockedReason, freezeDateLabel, streakSummary } from "./badges-view";

const getBadges = () => apiFetch<BadgesDto>("/api/v1/me/badges");
const getStreak = () => apiFetch<StreakDto>("/api/v1/me/streak");
const postStreakFreeze = (localDate: string) => apiPost<StreakDto>("/api/v1/me/streak-freeze", { localDate }, streakFreezeRequestSchema);

export interface BadgesSectionProps {
  userId: string;
}

/** Streak with its monthly freeze (Pro) and the badges everyone earns, on /perfil. */
export function BadgesSection({ userId }: BadgesSectionProps) {
  const { lock } = usePro();
  const [badges, setBadges] = useState<BadgeDto[] | null>(null);
  const [streak, setStreak] = useState<StreakDto | null>(null);
  const [freezeDate, setFreezeDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBadges()
      .then((dto) => {
        if (!cancelled) setBadges(dto.badges);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar tus insignias. Probá de nuevo más tarde.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (lock !== "unlocked") return;
    let cancelled = false;
    getStreak()
      .then((dto) => {
        if (cancelled) return;
        setStreak(dto);
        setFreezeDate(dto.freezableDates[dto.freezableDates.length - 1] ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar tu racha. Probá de nuevo más tarde.");
      });
    return () => {
      cancelled = true;
    };
  }, [lock, userId]);

  async function freeze() {
    if (!freezeDate) return;
    setSaving(true);
    setError(null);
    try {
      const next = await postStreakFreeze(freezeDate);
      setStreak(next);
      setFreezeDate(next.freezableDates[next.freezableDates.length - 1] ?? "");
      void getBadges().then((dto) => setBadges(dto.badges)).catch(() => undefined);
    } catch (err) {
      if (isProRequired(err)) openProUpsell("streak_freeze");
      else setError(err instanceof Error && err.message ? err.message : "No pudimos congelar el día. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (lock === "unknown") return null;

  const blocked = streak ? freezeBlockedReason(streak) : null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-control border border-app bg-surface-2 p-3">
      <h3 className="text-sm font-semibold text-main">Racha e insignias</h3>

      {lock === "locked" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Una vez por mes podés congelar un día sin estudio para no perder tu racha.</p>
          <button
            type="button"
            onClick={() => openProUpsell("streak_freeze")}
            className="relative self-start rounded-control border border-app bg-surface px-3 py-1.5 text-sm font-semibold text-main"
          >
            Congelar la racha
            <ProBadge />
          </button>
        </div>
      ) : streak ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-main">{streakSummary(streak)}</p>
          {streak.frozenDates.length > 0 ? (
            <p className="text-xs text-muted">Días congelados: {streak.frozenDates.slice(-3).map(freezeDateLabel).join(", ")}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-main">
              <span>Día a congelar</span>
              <select
                value={freezeDate}
                disabled={saving || blocked !== null}
                onChange={(e) => setFreezeDate(e.target.value)}
                className="min-h-9 rounded-control border border-app bg-surface px-2 text-sm text-main disabled:opacity-50"
              >
                {streak.freezableDates.map((date) => (
                  <option key={date} value={date}>
                    {freezeDateLabel(date)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void freeze()}
              disabled={saving || blocked !== null || !freezeDate}
              className="min-h-9 rounded-control border border-app bg-surface px-3 text-sm font-semibold text-main disabled:opacity-50"
            >
              Congelar día
            </button>
          </div>
          {blocked ? <p className="text-xs text-muted">{blocked}</p> : <p className="text-xs text-muted">Podés congelar un día por mes, de los últimos 7.</p>}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {badges === null ? (
        error ? null : <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {badges.map((badge) => (
            <li
              key={badge.id}
              className={`rounded-control border border-app p-2 ${badge.earned ? "bg-surface" : "bg-surface-2 opacity-70"}`}
            >
              <p className="text-sm font-semibold text-main">{badge.title}</p>
              <p className="text-xs text-muted">{badge.description}</p>
              {badge.earned ? null : (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.floor(badge.progress * 100)}
                  aria-label={`Avance de ${badge.title}`}
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]"
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.floor(badge.progress * 100)}%` }} />
                </div>
              )}
              <p className="mt-1 text-xs font-medium text-main">{badgeProgressText(badge)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
