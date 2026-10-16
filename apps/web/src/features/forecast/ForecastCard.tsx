"use client";

import { useEffect, useState } from "react";
import type { RoomForecastDto } from "@sala/contracts";
import { apiFetch, enc } from "@/features/pro/pro-api";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge, proLabel } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { artNow, headline, todaySlots } from "./forecast-view";

/** Decorative bar heights (%) for the locked teaser; not real data. */
const TEASER_BARS = [18, 30, 46, 62, 80, 92, 74, 58, 66, 48, 30, 20];

export interface ForecastCardProps {
  roomSlug: string;
}

/** Pro: expected occupancy for today by hour, from the last four weeks of check-ins. Free users get a teaser. */
export function ForecastCard({ roomSlug }: ForecastCardProps) {
  const { lock } = usePro();
  const [dto, setDto] = useState<RoomForecastDto | null>(null);

  useEffect(() => {
    if (lock !== "unlocked") return;
    let cancelled = false;
    apiFetch<RoomForecastDto>(`/api/v1/rooms/${enc(roomSlug)}/forecast`)
      .then((next) => {
        if (!cancelled) setDto(next);
      })
      .catch(() => {
        if (!cancelled) setDto(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lock, roomSlug]);

  if (lock === "unknown") return null;
  if (lock === "locked") {
    return (
      <section aria-label="Pronóstico de ocupación" className="relative flex flex-col gap-2 rounded-lg border border-app bg-surface p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-main">
          Pronóstico de ocupación
          <ProBadge inline />
        </p>
        <div aria-hidden="true" className="pointer-events-none flex h-14 select-none items-end gap-0.5 opacity-60 blur-[2px]">
          {TEASER_BARS.map((height, i) => (
            <span key={i} className="flex-1 rounded-sm bg-[var(--border-strong)]" style={{ height: `${height}%` }} />
          ))}
        </div>
        <p className="text-xs text-muted">Enterate a qué hora suele llenarse la sala.</p>
        <button type="button" onClick={() => openProUpsell("forecast")} aria-label={proLabel("Ver pronóstico", true)} className="absolute inset-x-0 bottom-0 top-8 z-10 flex items-center justify-center">
          <span className="relative rounded-control border border-app bg-surface px-3 py-2 text-sm font-semibold text-main shadow-sm">
            Ver pronóstico
            <ProBadge />
          </span>
        </button>
      </section>
    );
  }
  if (!dto || dto.computedAt === null) return null;

  const now = artNow(new Date());
  const slots = todaySlots(dto, now);
  const line = headline(dto, now);
  return (
    <section aria-label="Pronóstico de ocupación" className="flex flex-col gap-2 rounded-lg border border-app bg-surface p-3">
      <p className="text-sm font-semibold text-main">{line ?? "Pronóstico de hoy"}</p>
      <ol className="flex h-14 items-end gap-0.5" aria-label="Ocupación estimada por hora">
        {slots.map((slot) => (
          <li key={slot.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={slot.ratio === null ? `${slot.hour} h: sin datos` : `${slot.hour} h: ${Math.round(slot.ratio * 100)} %`}>
            <span
              className={`w-full rounded-sm ${slot.hour === now.hour ? "bg-primary" : "bg-[var(--border-strong)]"} ${slot.ratio === null ? "opacity-20" : ""}`}
              style={{ height: `${Math.max(4, Math.round((slot.ratio ?? 0) * 100))}%` }}
            />
          </li>
        ))}
      </ol>
      <div className="flex justify-between text-[10px] text-muted">
        <span>{dto.startHour} h</span>
        <span>{dto.endHour} h</span>
      </div>
      <p className="text-xs text-muted">Estimado con los check-ins de las últimas 4 semanas.</p>
    </section>
  );
}
