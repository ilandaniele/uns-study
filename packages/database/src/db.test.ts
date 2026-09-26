import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client.js";
import { migrate } from "./migrate.js";
import { seedInitialRoom } from "./seed.js";
import { checkIns } from "./schema/checkins.js";
import { user } from "./schema/auth.js";
import { rooms, seatCurrentState, seats } from "./schema/rooms.js";

async function freshDb(): Promise<Db> {
  const db = createDb({ pgliteDir: "memory://" });
  await migrate(db, "");
  return db;
}

describe("migrate + seed", () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("seeds exactly 108 active seats and 108 UNKNOWN seat_current_state rows", async () => {
    await seedInitialRoom(db);

    const [{ value: seatCount }] = await db.select({ value: count() }).from(seats).where(eq(seats.active, true));
    expect(seatCount).toBe(108);

    const unknownStates = await db.select().from(seatCurrentState);
    expect(unknownStates).toHaveLength(108);
    expect(unknownStates.every((s) => s.status === "UNKNOWN")).toBe(true);
  });

  it("is idempotent — seeding twice still yields 108 seats", async () => {
    await seedInitialRoom(db);
    await seedInitialRoom(db);

    const [{ value: seatCount }] = await db.select({ value: count() }).from(seats);
    expect(seatCount).toBe(108);

    const rows = await db.select().from(rooms);
    expect(rows).toHaveLength(1);
  });

  it("rejects a second ACTIVE check-in for the same user via the partial unique index", async () => {
    await seedInitialRoom(db);
    const [room] = await db.select().from(rooms);
    const allSeats = await db.select().from(seats);
    if (!room || allSeats.length < 2) throw new Error("seed missing data");

    await db.insert(user).values({ id: "u1", name: "Test User", email: "u1@example.com" });

    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await db.insert(checkIns).values({
      userId: "u1",
      roomId: room.id,
      seatId: allSeats[0]!.id,
      status: "ACTIVE",
      expiresAt,
    });

    await expect(
      db.insert(checkIns).values({
        userId: "u1",
        roomId: room.id,
        seatId: allSeats[1]!.id,
        status: "ACTIVE",
        expiresAt,
      }),
    ).rejects.toThrow();
  });

  it("rejects a second ACTIVE check-in for the same seat via the partial unique index", async () => {
    await seedInitialRoom(db);
    const [room] = await db.select().from(rooms);
    const allSeats = await db.select().from(seats);
    if (!room || allSeats.length < 1) throw new Error("seed missing data");

    await db.insert(user).values([
      { id: "u1", name: "User One", email: "u1@example.com" },
      { id: "u2", name: "User Two", email: "u2@example.com" },
    ]);

    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await db.insert(checkIns).values({
      userId: "u1",
      roomId: room.id,
      seatId: allSeats[0]!.id,
      status: "ACTIVE",
      expiresAt,
    });

    await expect(
      db.insert(checkIns).values({
        userId: "u2",
        roomId: room.id,
        seatId: allSeats[0]!.id,
        status: "ACTIVE",
        expiresAt,
      }),
    ).rejects.toThrow();
  });
});
