import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
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
