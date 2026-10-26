"use client";

import type { RoomDto, RoomSummary, SeatDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import { ROOM_HOURS_COPY } from "@/features/help/room-hours-copy";
import { latestSeatUpdateMs, updatedAgoLabel } from "./room-social";

export interface HeroProps {
  summary: RoomSummary;
  seats: SeatDto[];
  operatingHours?: RoomDto["operatingHours"];
}

/**
 * The room page's signature element: one sentence answering "¿hay lugar para estudiar ahora?"
 * at a glance, per the design brief. Purely presentational — derives everything from `summary`.
 */
export function Hero({ summary, seats, operatingHours }: HeroProps) {
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

  if (operatingHours?.open === false) {
    headline = <>La sala está cerrada</>;
    subline = ROOM_HOURS_COPY;
  } else if (!hasData) {
    headline = <>Todavía no hay datos de hoy</>;
    subline = "Todavía no hay reportes vigentes. Si estás en la sala, tocá tu lugar y marcá «Estoy acá».";
  } else if (summary.free === 0 && mostlyKnown) {
    headline = <>La sala está llena</>;
    subline = latestUpdateLabel(seats, now) ?? "Sin información reciente";
  } else if (summary.free === 0) {
    headline = <>No hay lugares libres confirmados</>;
    subline = unknownSubline(summary.unknown, seats, now);
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
      subline = unknownSubline(summary.unknown, seats, now);
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
      subline = latestUpdateLabel(seats, now) ?? "Sin información reciente";
    }
  }

  return (
    <div>
      <h2 className="t-title">{headline}</h2>
      <p className="mt-1 text-sm text-main">{subline}</p>
    </div>
  );
}

/** Same source of truth as the header's "Actualizado hace …" (real reports only); null when there is none. */
function latestUpdateLabel(seats: SeatDto[], now: Date): string | null {
  return updatedAgoLabel(latestSeatUpdateMs(seats), now);
}

function unknownSubline(unknown: number, seats: SeatDto[], now: Date): string {
  const base = `Sin datos de ${unknown} lugares`;
  const updated = latestUpdateLabel(seats, now);
  return updated ? `${base} · ${updated}` : base;
}
