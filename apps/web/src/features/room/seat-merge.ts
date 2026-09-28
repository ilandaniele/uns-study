import type { RoomMapDto, RoomSummary, SeatDisputeLiteDto, SeatDto, SeatStateChangedEvent } from "@uns/contracts";

/**
 * Client-side merge rules for room seat state. REST snapshots and `seat:state-changed` socket
 * events arrive on independent channels, so either can be older than what the map already
 * shows. Both are merged by `lastUpdatedAt` (server clock) so older data never overwrites newer.
 */

function ts(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const n = Date.parse(value);
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
}

/** Applies a socket event unless the seat already reflects a newer state. */
export function applySeatEvent(map: RoomMapDto | null, event: SeatStateChangedEvent): RoomMapDto | null {
  if (!map || event.roomId !== map.room.id) return map;
  let applied = false;
  const seats: SeatDto[] = map.seats.map((seat) => {
    if (seat.id !== event.seatId || ts(event.lastUpdatedAt) < ts(seat.lastUpdatedAt)) return seat;
    applied = true;
    return { ...seat, status: event.status, confidence: event.confidence, lastUpdatedAt: event.lastUpdatedAt };
  });
  return applied ? { ...map, seats } : map;
}

/**
 * Merges a freshly fetched snapshot into the current map. A seat whose current state is strictly
 * newer than the snapshot's (e.g. a socket event that landed while the request was in flight)
 * keeps its current state; the summary is then recounted so it matches the merged seats.
 */
export function mergeSnapshot(prev: RoomMapDto | null, next: RoomMapDto): RoomMapDto {
  if (!prev || prev.room.id !== next.room.id) return next;
  const prevById = new Map(prev.seats.map((s) => [s.id, s]));
  let keptAny = false;
  const seats: SeatDto[] = next.seats.map((seat) => {
    const current = prevById.get(seat.id);
    if (!current || ts(current.lastUpdatedAt) <= ts(seat.lastUpdatedAt)) return seat;
    keptAny = true;
    return {
      ...seat,
      status: current.status,
      confidence: current.confidence,
      lastUpdatedAt: current.lastUpdatedAt,
      sourceSummary: current.sourceSummary,
    };
  });
  if (!keptAny) return next;
  return { ...next, seats, summary: summarize(next.room.id, seats) };
}

/** Sets `seat.dispute` on the matching seat when a new vote opens (`seat:dispute-opened`). */
export function applyDisputeOpened(map: RoomMapDto | null, event: SeatDisputeLiteDto): RoomMapDto | null {
  if (!map) return map;
  const seats = map.seats.map((seat) =>
    seat.id === event.seatId ? { ...seat, dispute: { id: event.id, closesAt: event.closesAt } } : seat,
  );
  return { ...map, seats };
}

/** Clears `seat.dispute` once a vote resolves (`seat:dispute-resolved`) — the resulting seat status arrives separately via `seat:state-changed`. */
export function applyDisputeResolved(map: RoomMapDto | null, event: SeatDisputeLiteDto): RoomMapDto | null {
  if (!map) return map;
  const seats = map.seats.map((seat) =>
    seat.id === event.seatId && seat.dispute?.id === event.id ? { ...seat, dispute: null } : seat,
  );
  return { ...map, seats };
}

export function summarize(roomId: string, seats: SeatDto[]): RoomSummary {
  const summary: RoomSummary = { roomId, total: seats.length, free: 0, occupied: 0, uncertain: 0, unknown: 0 };
  for (const seat of seats) {
    if (seat.status === "FREE") summary.free += 1;
    else if (seat.status === "OCCUPIED") summary.occupied += 1;
    else if (seat.status === "UNCERTAIN") summary.uncertain += 1;
    else summary.unknown += 1;
  }
  return summary;
}
