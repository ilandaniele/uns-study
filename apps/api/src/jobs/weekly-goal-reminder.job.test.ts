import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { schema, type Db } from "@sala/database";
import { FixedClock } from "../platform/clock.js";
import { PushService } from "../notifications/push.service.js";
import { ProService } from "../subscriptions/pro.js";
import { RolesService } from "../users/roles.service.js";
import { WeeklyGoalService } from "../weekly-goal/weekly-goal.service.js";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { WeeklyGoalReminderJob, formatRemaining } from "./weekly-goal-reminder.job.js";

// ART is UTC-3. Week of Mon 2026-10-12 .. Sun 2026-10-18.
const SATURDAY = new Date("2026-10-17T21:30:00Z"); // Sat 18:30 ART
const SUNDAY_1759 = new Date("2026-10-18T20:59:00Z");
const SUNDAY_1805 = new Date("2026-10-18T21:05:00Z");
const SUNDAY_1905 = new Date("2026-10-18T22:05:00Z");

describe("formatRemaining", () => {
  it("formats hours and minutes", () => {
    expect(formatRemaining(150)).toBe("2 h 30 min");
    expect(formatRemaining(45)).toBe("45 min");
    expect(formatRemaining(180)).toBe("3 h");
  });
});

describe("WeeklyGoalReminderJob", () => {
  let db: Db;
  let clock: FixedClock;
  let weeklyGoal: WeeklyGoalService;
  let pro: ProService;
  let push: PushService;
  let send: MockInstance<PushService["sendToUser"]>;
  let candidates: MockInstance<WeeklyGoalService["reminderCandidates"]>;

  const makeJob = () => new WeeklyGoalReminderJob(db, push, pro, weeklyGoal, clock);
  const subscribe = (userId: string) =>
    db.insert(schema.pushSubscriptions).values({ userId, endpoint: `https://push.test/${userId}`, p256dh: "p", auth: "a" });
  const makePaid = (userId: string) => db.insert(schema.userSubscriptions).values({ userId, providerSubscriptionId: `sub-${userId}`, status: "authorized" });
  const study = async (minutes: number) => {
    const roomId = (await getRoom(db)).id;
    await db.insert(schema.studySessions).values({
      userId: "u1",
      roomId,
      startedAt: new Date("2026-10-14T13:00:00Z"),
      endedAt: new Date(new Date("2026-10-14T13:00:00Z").getTime() + minutes * 60_000),
      verifiedMinutes: minutes,
      localDate: "2026-10-14",
      source: "CHECK_IN",
    });
  };

  beforeEach(async () => {
    db = freshDb();
    clock = new FixedClock(SUNDAY_1805);
    weeklyGoal = new WeeklyGoalService(db, clock);
    pro = new ProService(db, new RolesService(db), { subscriptionsEnabled: true, clock });
    push = new PushService(db);
    send = vi.spyOn(push, "sendToUser").mockResolvedValue(null);
    candidates = vi.spyOn(weeklyGoal, "reminderCandidates");
    await insertUsers(db, ["u1", "u2", "u3", "u4"]);
    await makePaid("u1");
    await subscribe("u1");
    await weeklyGoal.put("u1", { minutes: 300 });
  });

  it("does no database work outside the Sunday 18:00 hour", async () => {
    const job = makeJob();
    for (const at of [SATURDAY, SUNDAY_1759, SUNDAY_1905]) {
      clock.set(at);
      await job.tick();
    }
    expect(candidates).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends once on Sunday 18:05 with the remaining time, then nothing on the next tick", async () => {
    const job = makeJob();
    await job.tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("u1", {
      title: "Tu meta semanal",
      body: "Te faltan 5 h para tu meta de esta semana.",
      url: "/perfil",
      tag: "weekly-goal",
    });
    clock.advance(5 * 60_000);
    await job.tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(candidates).toHaveBeenCalledTimes(1);
  });

  it("a fresh job instance in the same week sends nothing (throttle)", async () => {
    await makeJob().tick();
    clock.advance(10 * 60_000);
    await makeJob().tick();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("subtracts the progress of the week", async () => {
    await study(150);
    await makeJob().tick();
    expect(send.mock.calls[0]![1].body).toBe("Te faltan 2 h 30 min para tu meta de esta semana.");
  });

  it("skips users whose goal is met", async () => {
    await study(300);
    await makeJob().tick();
    expect(send).not.toHaveBeenCalled();
  });

  it("skips users with the reminder disabled, non-Pro users and users without a push subscription", async () => {
    await weeklyGoal.put("u1", { minutes: 300, reminderEnabled: false });
    await subscribe("u2"); // free
    await weeklyGoal.put("u2", { minutes: 300 });
    await makePaid("u3"); // Pro, no push subscription
    await weeklyGoal.put("u3", { minutes: 300 });
    await makePaid("u4"); // Pro, push, but no goal
    await subscribe("u4");
    await makeJob().tick();
    expect(send).not.toHaveBeenCalled();
  });
});
