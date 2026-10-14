import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Db } from "@sala/database";
import { freshDb } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";
import { RECURRING_JOBS, SqliteScheduler } from "../platform/scheduler.js";
import type { Services } from "../services.js";
import { registerJobs } from "./register-jobs.js";

function fakeServices() {
  const job = () => ({ tick: vi.fn(async () => undefined) });
  const jobs = {
    expiration: job(),
    disputeResolution: job(),
    dailyReset: job(),
    attachmentSweep: job(),
    checkInExpiryReminder: job(),
    emailSend: job(),
  };
  const realtime = { flushRoom: vi.fn(async () => undefined), emitAdminPresent: vi.fn() };
  const notifications = {
    fireAdminPresent: vi.fn(async (_roomId: string, _adminId: string, emit: () => void) => emit()),
  };
  return { jobs, realtime, notifications, services: { jobs, realtime, notifications } as unknown as Services };
}

describe("registerJobs", () => {
  let db: Db;
  let clock: FixedClock;
  let scheduler: SqliteScheduler;
  let sockets: { sweepSessions: Mock<() => Promise<void>> };
  let fake: ReturnType<typeof fakeServices>;

  beforeEach(() => {
    db = freshDb();
    clock = new FixedClock(new Date("2026-03-10T12:00:00Z"));
    scheduler = new SqliteScheduler(db, clock, () => {});
    sockets = { sweepSessions: vi.fn(async () => undefined) };
    fake = fakeServices();
    registerJobs(scheduler, fake.services, sockets);
    scheduler.ensureRecurring();
  });

  it("wires every recurring job to its handler", async () => {
    clock.advance(3_600_000);
    const { ran } = await scheduler.runDue();
    expect(ran.sort()).toEqual(RECURRING_JOBS.map((j) => j.key).sort());
    for (const j of Object.values(fake.jobs)) expect(j.tick).toHaveBeenCalledTimes(1);
    expect(sockets.sweepSessions).toHaveBeenCalledTimes(1);
  });

  it("runs the summary:<roomId> one-shot through the gateway flush", async () => {
    scheduler.schedule("summary:room-1", clock.now());
    await scheduler.runDue();
    expect(fake.realtime.flushRoom).toHaveBeenCalledWith("room-1");
    expect(scheduler.has("summary:room-1")).toBe(false);
  });

  it("runs admin-present:<adminUserId> through fireAdminPresent with a banner emitter", async () => {
    scheduler.schedule("admin-present:admin-1", clock.now(), { roomId: "room-1", adminUserId: "admin-1" });
    await scheduler.runDue();
    expect(fake.notifications.fireAdminPresent).toHaveBeenCalledWith("room-1", "admin-1", expect.any(Function));
    expect(fake.realtime.emitAdminPresent).toHaveBeenCalledWith("room-1", {});
  });

  it("ignores an admin-present job with a malformed payload", async () => {
    scheduler.schedule("admin-present:admin-1", clock.now(), { nope: true });
    await scheduler.runDue();
    expect(fake.notifications.fireAdminPresent).not.toHaveBeenCalled();
  });
});
