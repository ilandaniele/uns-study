import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { StudySessionService, type CheckInForSession } from "./study-session.service.js";

describe("StudySessionService", () => {
  let db: Db;
  let svc: StudySessionService;
  let roomId: string;

  beforeEach(async () => {
    db = await freshDb();
    svc = new StudySessionService(db);
    const room = await getRoom(db);
    roomId = room.id;
    await insertUsers(db, ["u1"]);
  });

  function checkIn(overrides: Partial<CheckInForSession> = {}): CheckInForSession {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      userId: "u1",
      roomId,
      startedAt: new Date("2026-01-05T10:00:00Z"),
      expiresAt: new Date("2026-01-05T11:00:00Z"),
      ...overrides,
    };
  }

  it("records verified minutes clamped to the check-in's own expiry", async () => {
    const ci = checkIn();
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:45:00Z")));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(row?.verifiedMinutes).toBe(45);
  });

  it("caps verified minutes at 240 even for a much longer session", async () => {
    const ci = checkIn({ id: "22222222-2222-2222-2222-222222222222", expiresAt: new Date("2026-01-06T10:00:00Z") });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-06T10:00:00Z")));

    const [row] = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(row?.verifiedMinutes).toBe(240);
  });

  it("skips sessions shorter than 5 minutes", async () => {
    const ci = checkIn({ id: "33333333-3333-3333-3333-333333333333" });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:04:00Z")));

    const rows = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(rows).toHaveLength(0);
  });

  it("is idempotent: recording the same check-in twice only inserts one row", async () => {
    const ci = checkIn({ id: "44444444-4444-4444-4444-444444444444" });
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:30:00Z")));
    await db.transaction((tx) => svc.recordFromCheckIn(tx, ci, new Date("2026-01-05T10:30:00Z")));

    const rows = await db.select().from(schema.studySessions).where(eq(schema.studySessions.checkInId, ci.id));
    expect(rows).toHaveLength(1);
  });
});
