"use client";

import type { RoomMapDto, RoomPersonDto } from "@sala/contracts";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Hero } from "./Hero";
import { PeopleList } from "@/features/people/PeopleList";
import { UpdatedAgo } from "./RoomSocialProof";
import { SummaryCounters } from "./SummaryCounters";
import { roomCapacityBreakdown, todayLabel } from "./format";

export interface RoomInfoPanelProps {
  map: RoomMapDto;
  people: RoomPersonDto[];
  connected: boolean;
  onOpenHowTo: () => void;
  /** Toolbar rendered under the counters (find free seat, filter, favorite, share). */
  quickActions?: ReactNode;
  /** Seat detail or empty state, rendered right after the counters. */
  detailSlot?: ReactNode;
}

/** Desktop (lg+) left column: room header, honest headline, counters, capacity breakdown and the "who's here" preview. */
export function RoomInfoPanel({ map, people, connected, onOpenHowTo, quickActions, detailSlot }: RoomInfoPanelProps) {
  const breakdown = roomCapacityBreakdown(map);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="t-display">{map.room.name}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-[var(--seat-unknown)]"}`}
          />
          {connected ? "En vivo" : "Reconectando…"} · {todayLabel()}
          <UpdatedAgo seats={map.seats} />
          <span className="sr-only" aria-live="polite">
            {connected ? "" : "Reconectando, el mapa puede estar desactualizado"}
          </span>
        </p>
      </div>

      <Hero summary={map.summary} seats={map.seats} />
      <SummaryCounters summary={map.summary} />
      {detailSlot ? <div className="border-t border-app pt-4">{detailSlot}</div> : null}
      {quickActions ? <div className="flex flex-col gap-4 border-t border-app pt-4">{quickActions}</div> : null}

      <div className="border-t border-app pt-4">
        <p className="t-title text-base">Total: {map.summary.total} lugares</p>
        <ul className="t-data mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
          {breakdown.map((group) => (
            <li key={group.label}>
              {group.tableCount} {group.label} ({group.seatsPerTable} lugares c/u) = {group.tableCount * group.seatsPerTable}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onOpenHowTo}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-surface-2 px-4 py-2.5 text-sm font-semibold text-main hover:bg-[var(--border)]"
      >
        <QuestionIcon aria-hidden="true" size={18} weight="bold" />
        Ver cómo usar la app
      </button>

      <div className="border-t border-app pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="t-title text-base">Personas en la sala ({people.length})</h2>
          <Link href="/personas" className="text-xs font-semibold text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        <PeopleList people={people} limit={5} />
      </div>
    </div>
  );
}
