"use client";

import type { RoomSummary, SeatDto } from "@sala/contracts";
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
  const known = summary.free + summary.occupied + summary.saved + summary.uncertain;
  const hasData = known > 0;
  // "Full" is only a fair claim when most seats have fresh evidence; otherwise say what we know.
  const mostlyKnown = summary.total > 0 && known / summary.total >= 0.8;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  let headline: React.ReactNode;
  let subline: string;

  if (!hasData) {
    headline = <>Todavía no hay datos de hoy</>;
    subline = "Los datos se reinician cada madrugada. Si estás en la sala, tocá tu lugar y marcá «Estoy acá».";
  } else if (summary.free === 0 && mostlyKnown) {
    headline = <>La sala está llena</>;
    subline = latestUpdateLabel(seats, now);
  } else if (summary.free === 0) {
    headline = <>No hay lugares libres confirmados</>;
    subline = `Sin datos de ${summary.unknown} lugares · ${latestUpdateLabel(seats, now)}`;
  } else {
    const n = summary.free;
    const places = n === 1 ? "lugar libre" : "lugares libres";
    const count = <span className="font-mono" style={{ color: "var(--seat-free)" }}>{n}</span>;
    if (!mostlyKnown) {
      headline = (
        <>
          Hay {count} {places} {n === 1 ? "confirmado" : "confirmados"}
        </>
      );
      subline = `Sin datos de ${summary.unknown} lugares · ${latestUpdateLabel(seats, now)}`;
    } else {
      headline = n <= 5 ? (
        <>
          {n === 1 ? "Queda" : "Quedan"} {count} {places}
        </>
      ) : (
        <>
          Hay {count} {places}
        </>
      );
      subline = latestUpdateLabel(seats, now);
    }
  }

  return (
    <div>
      <h2 className="t-title">{headline}</h2>
      <p className="mt-1 text-sm text-main">{subline}</p>
    </div>
  );
}

function latestUpdateLabel(seats: SeatDto[], now: Date): string {
  const latest = seats.reduce<string | null>((acc, seat) => {
    if (!seat.lastUpdatedAt) return acc;
    if (!acc || seat.lastUpdatedAt > acc) return seat.lastUpdatedAt;
    return acc;
  }, null);
  const recency = latest ? recencyLabel({ status: "FREE", sourceSummary: "OBS", lastUpdatedAt: latest }, now) : null;
  return recency ?? "Sin información reciente";
}
