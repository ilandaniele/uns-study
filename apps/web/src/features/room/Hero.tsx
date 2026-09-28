"use client";

import type { RoomSummary, SeatDto } from "@uns/contracts";
import { useEffect, useState } from "react";
import { recencyLabel } from "./format";

export interface HeroProps {
  summary: RoomSummary;
  seats: SeatDto[];
}

/**
 * The room page's signature element: one sentence answering "¿hay lugar para estudiar ahora?"
 * at a glance, per the design brief. Purely presentational — derives everything from `summary`.
 */
export function Hero({ summary, seats }: HeroProps) {
  const hasData = summary.free + summary.occupied + summary.uncertain > 0;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  let headline: React.ReactNode;
  let subline: string;

  if (!hasData) {
    headline = <>Todavía no hay datos de hoy</>;
    subline = "Si estás en la sala, marcá tu lugar y ayudá al resto.";
  } else if (summary.free === 0) {
    headline = <>La sala está llena</>;
    subline = latestUpdateLabel(seats, now, summary.total);
  } else if (summary.free <= 5) {
    headline = (
      <>
        Quedan <span style={{ color: "var(--seat-free)" }}>{summary.free}</span> lugares libres
      </>
    );
    subline = latestUpdateLabel(seats, now, summary.total);
  } else {
    headline = (
      <>
        Hay <span style={{ color: "var(--seat-free)" }}>{summary.free}</span> lugares libres
      </>
    );
    subline = latestUpdateLabel(seats, now, summary.total);
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold leading-tight text-main sm:text-3xl">{headline}</h1>
      <p className="mt-1 font-mono text-xs text-muted">{subline}</p>
    </div>
  );
}

function latestUpdateLabel(seats: SeatDto[], now: Date, total: number): string {
  const latest = seats.reduce<string | null>((acc, seat) => {
    if (!seat.lastUpdatedAt) return acc;
    if (!acc || seat.lastUpdatedAt > acc) return seat.lastUpdatedAt;
    return acc;
  }, null);
  const recency = latest ? recencyLabel({ status: "FREE", sourceSummary: "OBS", lastUpdatedAt: latest }, now) : null;
  return `${recency ?? "Sin información reciente"} · ${total} lugares`;
}
