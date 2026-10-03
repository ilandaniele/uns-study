import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomStateService } from "./room-state.service.js";

describe("RoomStateService.getRoomSummary", () => {
  let db: Db;
  let roomState: RoomStateService;
  let roomId: string;
  let seatId: string;

  beforeEach(async () => {
    db = await freshDb();
    roomState = new RoomStateService(db);
    const room = await getRoom(db);
    roomId = room.id;
    seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
  });

  it("agrees with getLiveSeatStates even when a persisted seat_current_state row is stale (an observation expired but hasn't been swept)", async () => {
    // Seed a stale persisted OCCUPIED state, as if it were computed while the observation below was
    // still active — nothing has reconciled it since it expired.
    const stale = new Date(Date.now() - 60 * 60_000);
    await db
      .insert(schema.seatCurrentState)
      .values({ seatId, status: "OCCUPIED", confidence: 0.6, sourceSummary: "OBSERVATION", lastUpdatedAt: stale, updatedAt: stale })
      .onConflictDoUpdate({
        target: schema.seatCurrentState.seatId,
        set: { status: "OCCUPIED", confidence: 0.6, sourceSummary: "OBSERVATION", lastUpdatedAt: stale, updatedAt: stale },
      });
    await db.insert(schema.seatObservations).values({
      userId: "u1",
      roomId,
      seatId,
      observedStatus: "OCCUPIED",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 1,
      observedAt: new Date(stale.getTime() - 20 * 60_000),
      expiresAt: stale,
    });

    const now = new Date();
    const live = await roomState.getLiveSeatStates(roomId, now);
    const summary = await roomState.getRoomSummary(roomId);

    // The live map (what a fresh room-map fetch and every seat:state-changed event reflect) must
    // never disagree with what room:summary-changed reports.
    expect(live.get(seatId)?.status).toBe("UNKNOWN");
    expect(summary.total).toBe(live.size);
    expect(summary.unknown).toBe([...live.values()].filter((s) => s.status === "UNKNOWN").length);
    expect(summary.occupied).toBe(0); // must not still count the stale OCCUPIED row
  });
});

describe("RoomStateService SAVED seats", () => {
  it("getRoomSummary counts a SAVED seat under `saved`", async () => {
    const db = await freshDb();
    const roomState = new RoomStateService(db);
    const room = await getRoom(db);
    const seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);
    const now = new Date();
    await db.insert(schema.seatObservations).values({
      userId: "u1",
      roomId: room.id,
      seatId,
      observedStatus: "SAVED",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 1,
      observedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    });

    const summary = await roomState.getRoomSummary(room.id);
    expect(summary.saved).toBe(1);
    expect(summary.occupied).toBe(0);
  });
});

describe("RoomStateService query counts", () => {
  it("getLiveSeatStates runs its reads as one parallel batch and skips the seats read when pre-loaded", async () => {
    const db = await freshDb();
    const roomState = new RoomStateService(db);
    const room = await getRoom(db);
    const seats = await getSeats(db);
    let count = 0;
    const original = db.select.bind(db);
    const spy = vi.spyOn(db, "select").mockImplementation(((...a: unknown[]) => {
      count++;
      return (original as (...x: unknown[]) => unknown)(...a);
    }) as never);

    await roomState.getLiveSeatStates(room.id);
    const unloaded = count; // seats, check-ins, open, tied, observations, stored + active-check-in subquery
    count = 0;
    await roomState.getLiveSeatStates(room.id, new Date(), seats.filter((s) => s.active));
    spy.mockRestore();
    expect(unloaded).toBe(7);
    expect(count).toBe(6);
  });
});

describe("RoomStateService.recomputeSeats stamp ordering", () => {
  it("a recompute carrying an older `now` than the seat's persisted stamp still gets a strictly newer lastUpdatedAt", async () => {
    // Regression for the flaky 02-checkin-realtime: the expiration sweep (later `now`) won the
    // seat's advisory lock before a check-in that had captured an earlier `now`, so the check-in's
    // OCCUPIED carried an older stamp than the sweep's UNKNOWN and clients kept UNKNOWN.
    const db = await freshDb();
    const roomState = new RoomStateService(db);
    const room = await getRoom(db);
    const seatId = (await getSeats(db))[0]!.id;
    await insertUsers(db, ["u1"]);

    const early = new Date(Date.now() + 60 * 60_000);
    const late = new Date(early.getTime() + 500);
    await roomState.recomputeSeats([seatId], { roomId: room.id, now: late, eventType: "EXPIRATION_SWEEP" });

    await db.insert(schema.checkIns).values({
      userId: "u1",
      roomId: room.id,
      seatId,
      status: "ACTIVE",
      showIdentity: false,
      presenceVerified: true,
      locationAccuracyM: 10,
      startedAt: early,
      expiresAt: new Date(early.getTime() + 180 * 60_000),
    });
    const checkIn = await roomState.recomputeSeats([seatId], { roomId: room.id, now: early, eventType: "CHECK_IN", actingUserId: "u1" });
    expect(checkIn[0]?.status).toBe("OCCUPIED");
    expect(checkIn[0]!.lastUpdatedAt.getTime()).toBeGreaterThan(late.getTime());

    const [stored] = await db.select().from(schema.seatCurrentState).where(eq(schema.seatCurrentState.seatId, seatId));
    expect(new Date(stored!.lastUpdatedAt).getTime()).toBe(checkIn[0]!.lastUpdatedAt.getTime());
  });
});
