"use client";

import type { RoomMapDto, RoomPersonDto } from "@uns/contracts";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Hero } from "./Hero";
import { PeopleList } from "@/features/people/PeopleList";
import { SummaryCounters } from "./SummaryCounters";
import { roomCapacityBreakdown, todayLabel } from "./format";

export interface RoomInfoPanelProps {
  map: RoomMapDto;
  people: RoomPersonDto[];
  connected: boolean;
  onOpenHowTo: () => void;
  /** Toolbar rendered under the counters (find free seat, filter, favorite, share). */
  quickActions?: ReactNode;
}

/** Desktop (lg+) left column: room header, honest headline, counters, capacity breakdown and the "who's here" preview. */
export function RoomInfoPanel({ map, people, connected, onOpenHowTo, quickActions }: RoomInfoPanelProps) {
  const breakdown = roomCapacityBreakdown(map);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[26px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">{map.room.name}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-[var(--seat-unknown)]"}`}
          />
          Abierto · {todayLabel()}
        </p>
      </div>

      <Hero summary={map.summary} seats={map.seats} />
      <SummaryCounters summary={map.summary} />
      {quickActions}

      <div className="rounded-2xl border border-app bg-surface p-3">
        <p className="text-sm font-semibold text-main">Total: {map.summary.total} lugares</p>
        <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
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
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        <QuestionIcon aria-hidden="true" size={18} weight="bold" />
        Ver cómo usar la app
      </button>

      <div className="rounded-2xl border border-app bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-main">Personas en la sala ({people.length})</h2>
          <Link href="/personas" className="text-xs font-semibold text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        <PeopleList people={people} limit={5} />
      </div>
    </div>
  );
}
