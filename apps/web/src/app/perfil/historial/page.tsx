"use client";

import type { StudyHistoryDto } from "@sala/contracts";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useFocus } from "@/features/focus/focus-store";
import { recentDays, streakDays } from "@/features/focus/pomodoro";
import { apiFetch, isProRequired } from "@/features/pro/pro-api";
import { downloadCsv, historyCsv } from "@/features/study-history/csv";
import { formatMinutes, HistoryCharts } from "@/features/study-history/HistoryCharts";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { useSession } from "@/lib/auth-client";
import { useNow } from "@/lib/use-now";

type Days = 30 | 90;

const noopSubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

/** Focus blocks live in this browser only (localStorage), so they are shown apart from the server history. */
function LocalFocusBlock() {
  const mounted = useMounted();
  const { stats } = useFocus();
  const now = useNow(60_000).getTime();
  if (!mounted) return null;
  const week = recentDays(stats, now, 7).reduce((a, d) => a + d.minutes, 0);
  const month = recentDays(stats, now, 30).reduce((a, d) => a + d.minutes, 0);
  return (
    <section className="border-t border-app py-6">
      <h2 className="mb-1 t-title">Foco en este dispositivo</h2>
      <p className="mb-3 text-xs text-muted">Bloques del temporizador, guardados solo en este navegador.</p>
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted">Racha</dt>
          <dd className="font-mono text-xl font-semibold text-main">{streakDays(stats, now)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">7 días</dt>
          <dd className="font-mono text-xl font-semibold text-main">{formatMinutes(week)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">30 días</dt>
          <dd className="font-mono text-xl font-semibold text-main">{formatMinutes(month)}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function HistorialPage() {
  const { data: session, isPending } = useSession();
  const { lock } = usePro();
  const [days, setDays] = useState<Days>(30);
  const [history, setHistory] = useState<StudyHistoryDto | null>(null);
  // The window an error belongs to, so switching 30/90 clears it without resetting state inside the effect.
  const [failedDays, setFailedDays] = useState<Days | null>(null);

  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (!signedIn || lock !== "unlocked") return;
    let cancelled = false;
    apiFetch<StudyHistoryDto>(`/api/v1/me/study-history?days=${days}`)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isProRequired(err)) openProUpsell("study_history");
        else setFailedDays(days);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, lock, days]);

  if (isPending) return <main className="p-6 text-center text-muted">Cargando…</main>;
  if (!signedIn) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted">Iniciá sesión para ver tu historial.</p>
        <Link href="/login" className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white">
          Ingresar
        </Link>
      </main>
    );
  }

  const error = failedDays === days ? "No pudimos cargar tu historial. Probá de nuevo en un rato." : null;
  const shown = history && history.days === days ? history : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-0 p-4 pb-16">
      <Link href="/perfil" className="text-sm text-muted underline">
        Volver al perfil
      </Link>
      <h1 className="mt-2 t-heading">Historial de estudio</h1>

      {lock === "locked" ? (
        <section className="py-6">
          <p className="text-sm text-muted">Mirá cuánto estudiaste, a qué hora rendís más y exportalo a CSV.</p>
          <button
            type="button"
            onClick={() => openProUpsell("study_history")}
            className="relative mt-3 rounded-control border border-app bg-surface px-3 py-2 text-sm font-semibold text-main"
          >
            Ver historial
            <ProBadge />
          </button>
        </section>
      ) : lock === "unlocked" ? (
        <section className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Período" className="flex gap-1">
              {([30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days === d}
                  onClick={() => setDays(d)}
                  className={`rounded-control border border-app px-3 py-1.5 text-sm font-semibold ${days === d ? "bg-primary text-white" : "bg-surface text-main"}`}
                >
                  {d} días
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!shown}
              onClick={() => shown && downloadCsv(`historial-${shown.from}_${shown.to}.csv`, historyCsv(shown.byDay))}
              className="rounded-control border border-app bg-surface px-3 py-1.5 text-sm font-semibold text-main disabled:opacity-60"
            >
              Exportar CSV
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          ) : shown ? (
            <div className="mt-4">
              <HistoryCharts history={shown} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Cargando…</p>
          )}
        </section>
      ) : null}

      <LocalFocusBlock />
    </main>
  );
}
