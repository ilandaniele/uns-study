import type { RoomMapDto, SeatDto, SeatStateChangedEvent } from "@uns/contracts";
import { describe, expect, it } from "vitest";
import { applySeatEvent, mergeSnapshot } from "./seat-merge";

const ROOM = "room-1";

function seat(id: string, status: SeatDto["status"], lastUpdatedAt: string | null): SeatDto {
  return {
    id,
    tableId: "t1",
    code: id,
    seatNumber: 1,
    x: 0,
    y: 0,
    rotation: 0,
    status,
    confidence: status === "UNKNOWN" ? 0 : 0.98,
    lastUpdatedAt,
    sourceSummary: null,
    dispute: null,
  };
}

function map(seats: SeatDto[]): RoomMapDto {
  return {
    room: { id: ROOM } as RoomMapDto["room"],
    summary: { roomId: ROOM, total: seats.length, free: 0, occupied: 0, uncertain: 0, unknown: seats.length },
    tables: [],
    seats,
    viewBox: { width: 1000, height: 1600 },
  };
}

function event(seatId: string, status: SeatDto["status"], lastUpdatedAt: string): SeatStateChangedEvent {
  return { roomId: ROOM, seatId, status, confidence: 0.98, lastUpdatedAt };
}

describe("applySeatEvent", () => {
  it("applies an event newer than the seat's state", () => {
    const next = applySeatEvent(map([seat("a", "UNKNOWN", "2026-01-01T10:00:00Z")]), event("a", "OCCUPIED", "2026-01-01T10:05:00Z"));
    expect(next!.seats[0]!.status).toBe("OCCUPIED");
  });

  it("ignores an event older than the seat's state", () => {
    const current = map([seat("a", "OCCUPIED", "2026-01-01T10:05:00Z")]);
    expect(applySeatEvent(current, event("a", "UNKNOWN", "2026-01-01T10:00:00Z"))).toBe(current);
  });

  it("ignores events for another room", () => {
    const current = map([seat("a", "UNKNOWN", null)]);
    expect(applySeatEvent(current, { ...event("a", "OCCUPIED", "2026-01-01T10:00:00Z"), roomId: "other" })).toBe(current);
  });
});

describe("mergeSnapshot", () => {
  it("does not let a snapshot fetched before a check-in roll back the event that followed it", () => {
    // Regression: map REST response computed before a check-in committed, arriving after the
    // `seat:state-changed` OCCUPIED event, used to overwrite the seat back to UNKNOWN ("Sin datos").
    const afterEvent = map([seat("a", "OCCUPIED", "2026-01-01T10:05:00Z"), seat("b", "UNKNOWN", null)]);
    const staleSnapshot = map([seat("a", "UNKNOWN", "2026-01-01T09:00:00Z"), seat("b", "FREE", "2026-01-01T10:06:00Z")]);

    const merged = mergeSnapshot(afterEvent, staleSnapshot);

    expect(merged.seats.find((s) => s.id === "a")!.status).toBe("OCCUPIED");
    expect(merged.seats.find((s) => s.id === "b")!.status).toBe("FREE");
    expect(merged.summary).toEqual({ roomId: ROOM, total: 2, free: 1, occupied: 1, uncertain: 0, unknown: 0 });
  });

  it("takes the snapshot when it is as new or newer", () => {
    const prev = map([seat("a", "OCCUPIED", "2026-01-01T10:05:00Z")]);
    const snapshot = map([seat("a", "FREE", "2026-01-01T10:05:00Z")]);
    expect(mergeSnapshot(prev, snapshot)).toBe(snapshot);
  });

  it("replaces everything on first load or a different room", () => {
    const snapshot = map([seat("a", "FREE", "2026-01-01T10:05:00Z")]);
    expect(mergeSnapshot(null, snapshot)).toBe(snapshot);
    const other = { ...map([seat("a", "OCCUPIED", "2027-01-01T00:00:00Z")]), room: { id: "other" } as RoomMapDto["room"] };
    expect(mergeSnapshot(other, snapshot)).toBe(snapshot);
  });
});
