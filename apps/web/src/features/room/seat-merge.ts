import type { CheckInDto, RoomMapDto, RoomSummary, SeatDisputeLiteDto, SeatDto, SeatStateChangedEvent, TableNicknameChangedEvent } from "@uns/contracts";

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
    return { ...seat, status: event.status, confidence: event.confidence, lastUpdatedAt: event.lastUpdatedAt, verified: event.verified };
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
      verified: current.verified,
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

/** Updates a table's nickname on `table:nickname-changed` — the map pill re-renders immediately. */
export function applyTableNicknameChanged(map: RoomMapDto | null, event: TableNicknameChangedEvent): RoomMapDto | null {
  if (!map) return map;
  const tables = map.tables.map((table) => (table.id === event.tableId ? { ...table, nickname: event.nickname } : table));
  return { ...map, tables };
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

// ---- Optimistic updates ----

/** Mirrors the API's check-in length (`CHECKIN_MINUTES`). */
const CHECKIN_MINUTES = 60;

/** Confidence shown for an optimistic seat; the socket event / snapshot replaces it with the server's. */
const OPTIMISTIC_CONFIDENCE = 0.9;

/** Stamp for a seat that was never updated: later than "never", earlier than any real server time. */
const EPOCH_PLUS_1MS = "1970-01-01T00:00:00.001Z";

/** What an optimistic seat change replaced, so it can be settled or rolled back. */
export interface SeatPatch {
  seatId: string;
  previous: SeatDto;
  /** The `lastUpdatedAt` written by the optimistic change; identifies "nobody touched the seat since". */
  stamp: string;
}

function withSeat(map: RoomMapDto, seatId: string, update: (seat: SeatDto) => SeatDto): RoomMapDto {
  const seats = map.seats.map((seat) => (seat.id === seatId ? update(seat) : seat));
  return { ...map, seats, summary: summarize(map.room.id, seats) };
}

/**
 * Optimistically sets a seat's status. The stamp is the seat's `lastUpdatedAt` + 1 ms (no client
 * clock involved), so an older snapshot can't overwrite it while any real server event — which is
 * always later — still can.
 */
export function applyOptimisticSeat(
  map: RoomMapDto | null,
  seatId: string,
  status: SeatDto["status"],
): { map: RoomMapDto | null; patch: SeatPatch | null } {
  const previous = map?.seats.find((seat) => seat.id === seatId);
  if (!map || !previous) return { map, patch: null };
  const stamp = previous.lastUpdatedAt ? new Date(ts(previous.lastUpdatedAt) + 1).toISOString() : EPOCH_PLUS_1MS;
  const next = withSeat(map, seatId, (seat) => ({ ...seat, status, confidence: OPTIMISTIC_CONFIDENCE, lastUpdatedAt: stamp, verified: false }));
  return { map: next, patch: { seatId, previous, stamp } };
}

/** Request succeeded: if no event/snapshot replaced the optimistic seat, hand its timestamp back so the next real update applies. */
export function settleOptimisticSeat(map: RoomMapDto | null, patch: SeatPatch | null): RoomMapDto | null {
  if (!map || !patch) return map;
  const current = map.seats.find((seat) => seat.id === patch.seatId);
  if (!current || current.lastUpdatedAt !== patch.stamp) return map;
  return withSeat(map, patch.seatId, (seat) => ({ ...seat, lastUpdatedAt: patch.previous.lastUpdatedAt }));
}

/** Request failed: restore the previous seat, unless something newer already replaced the optimistic state. */
export function rollbackOptimisticSeat(map: RoomMapDto | null, patch: SeatPatch | null): RoomMapDto | null {
  if (!map || !patch) return map;
  const current = map.seats.find((seat) => seat.id === patch.seatId);
  if (!current || current.lastUpdatedAt !== patch.stamp) return map;
  return withSeat(map, patch.seatId, () => patch.previous);
}

/** Placeholder `activeCheckIn` shown until the POST response (the real DTO) replaces it. */
export function buildOptimisticCheckIn(seat: SeatDto, roomId: string, showIdentity: boolean, nowMs: number): CheckInDto {
  return {
    id: `optimistic-${seat.id}`,
    roomId,
    seatId: seat.id,
    seatCode: seat.code,
    status: "ACTIVE",
    startedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + CHECKIN_MINUTES * 60_000).toISOString(),
    showIdentity,
    verifiedAt: null,
    verificationExpiresAt: null,
  };
}

/** Optimistic "Seguir acá": a fresh full-length window from now, as the API grants. */
export function extendCheckIn(checkIn: CheckInDto, nowMs: number): CheckInDto {
  return { ...checkIn, expiresAt: new Date(nowMs + CHECKIN_MINUTES * 60_000).toISOString() };
}
