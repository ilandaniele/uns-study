import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { ApiException } from "../common/api-error.js";
import { FixedClock } from "../platform/clock.js";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { ExamsService } from "./exams.service.js";

const NOW = new Date("2026-10-16T15:00:00Z"); // 12:00 ART, 2026-10-16

async function rejection(p: Promise<unknown>): Promise<ApiException> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiException);
    return err as ApiException;
  }
  throw new Error("expected a rejection");
}

describe("ExamsService", () => {
  let db: Db;
  let clock: FixedClock;
  let service: ExamsService;
  let roomId: string;

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(NOW);
    service = new ExamsService(db, clock);
    roomId = (await getRoom(db)).id;
    await insertUsers(db, ["u1", "u2"]);
  });

  const input = (over: Partial<{ subject: string; examDate: string; targetHours: number }> = {}) => ({
    subject: "Algebra",
    examDate: "2026-10-26",
    targetHours: 10,
    ...over,
  });

  async function session(startedAt: string, minutes: number) {
    await db.insert(schema.studySessions).values({
      userId: "u1",
      roomId,
      checkInId: null,
      startedAt: new Date(startedAt),
      endedAt: new Date(new Date(startedAt).getTime() + minutes * 60_000),
      verifiedMinutes: minutes,
      localDate: startedAt.slice(0, 10),
      source: "CHECK_IN",
    });
  }

  it("creates an exam with its countdown and plan", async () => {
    const exam = await service.create("u1", input());
    expect(exam).toMatchObject({ subject: "Algebra", examDate: "2026-10-26", targetHours: 10, daysLeft: 10, studiedMinutes: 0, dailyPlanMinutes: 60 });
  });

  it("caps at 6 exams per user", async () => {
    for (let i = 0; i < 6; i++) await service.create("u1", input({ subject: `M${i}` }));
    const err = await rejection(service.create("u1", input()));
    expect(err.status).toBe(400);
    expect(err.message).toContain("Máximo 6");
    await expect(service.create("u2", input())).resolves.toBeDefined();
  });

  it("rejects a past or impossible date on create, allows today", async () => {
    expect((await rejection(service.create("u1", input({ examDate: "2026-10-15" })))).status).toBe(400);
    expect((await rejection(service.create("u1", input({ examDate: "2026-02-31" })))).status).toBe(400);
    await expect(service.create("u1", input({ examDate: "2026-10-16" }))).resolves.toMatchObject({ daysLeft: 0 });
  });

  it("lists sorted by date and includes the career", async () => {
    await db.insert(schema.userProfiles).values({ userId: "u1", career: "Ingeniería" });
    await service.create("u1", input({ subject: "B", examDate: "2026-11-20" }));
    await service.create("u1", input({ subject: "A", examDate: "2026-10-20" }));
    const got = await service.list("u1");
    expect(got.exams.map((e) => e.subject)).toEqual(["A", "B"]);
    expect(got.career).toBe("Ingeniería");
    expect((await service.list("u2")).career).toBeNull();
  });

  it("counts only minutes studied since the exam was created", async () => {
    await session("2026-10-15T13:00:00Z", 120); // before createdAt
    const exam = await service.create("u1", input());
    clock.set(new Date("2026-10-17T15:00:00Z"));
    await session("2026-10-17T13:00:00Z", 90); // after createdAt
    const got = await service.list("u1");
    expect(got.exams.find((e) => e.id === exam.id)?.studiedMinutes).toBe(90);
  });

  it("updates only for the owner (404 otherwise)", async () => {
    const exam = await service.create("u1", input());
    const updated = await service.update("u1", exam.id, { targetHours: 20, subject: "Análisis" });
    expect(updated).toMatchObject({ targetHours: 20, subject: "Análisis", dailyPlanMinutes: 120 });
    expect((await rejection(service.update("u2", exam.id, { targetHours: 1 }))).status).toBe(404);
    expect((await service.list("u1")).exams[0]?.targetHours).toBe(20);
  });

  it("deletes only for the owner (404 otherwise)", async () => {
    const exam = await service.create("u1", input());
    expect((await rejection(service.remove("u2", exam.id))).status).toBe(404);
    await service.remove("u1", exam.id);
    expect((await service.list("u1")).exams).toEqual([]);
    expect((await rejection(service.remove("u1", exam.id))).status).toBe(404);
  });

  it("a past exam has a negative countdown and no plan", async () => {
    const exam = await service.create("u1", input({ examDate: "2026-10-18" }));
    clock.set(new Date("2026-10-25T15:00:00Z"));
    expect((await service.list("u1")).exams[0]).toMatchObject({ id: exam.id, daysLeft: -7, dailyPlanMinutes: null });
  });

  it("without the table: list is empty, writes answer featureDisabled", async () => {
    db.run(sql`DROP TABLE user_exams`);
    expect(await service.list("u1")).toEqual({ exams: [], career: null });
    expect((await rejection(service.create("u1", input()))).code).toBe("FEATURE_DISABLED");
    expect((await rejection(service.update("u1", "x", { targetHours: 2 }))).code).toBe("FEATURE_DISABLED");
    expect((await rejection(service.remove("u1", "x"))).code).toBe("FEATURE_DISABLED");
  });
});
