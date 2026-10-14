import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createTestDb } from "@sala/database/testing";
import { FixedClock } from "./clock.js";
import { ManualScheduler, RECURRING_JOBS, SqliteScheduler, type JobHandler } from "./scheduler.js";

// Not test-utils.ts: that imports the whole service graph, which this unit does not need.
const freshDb = () => createTestDb({ template: readFileSync(process.env.SALA_TEST_TEMPLATE ?? "") });

const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe.each([
  ["SqliteScheduler", () => {
    const clock = new FixedClock(T0);
    const changes: Array<Date | null> = [];
    const s = new SqliteScheduler(freshDb(), clock, (n) => changes.push(n));
    return { s, clock, changes };
  }],
  ["ManualScheduler", () => {
    const clock = new FixedClock(T0);
    return { s: new ManualScheduler(clock), clock, changes: [] as Array<Date | null> };
  }],
])("%s", (_name, make) => {
  let s: SqliteScheduler | ManualScheduler;
  let clock: FixedClock;
  let calls: Array<{ key: string; payload: unknown }>;
  const handler: JobHandler = ({ key, payload }) => {
    calls.push({ key, payload });
  };

  beforeEach(() => {
    ({ s, clock } = make());
    calls = [];
  });

  it("schedule replaces due time and payload for the same key", async () => {
    s.register("job", handler);
    s.schedule("job", at(5_000), { n: 1 });
    s.schedule("job", at(1_000), { n: 2 });
    expect((await s.runDue(at(500))).ran).toEqual([]);
    expect((await s.runDue(at(1_000))).ran).toEqual(["job"]);
    expect(calls).toEqual([{ key: "job", payload: { n: 2 } }]);
    expect(s.has("job")).toBe(false);
  });

  it("scheduleIfAbsent inserts once and keeps the first due time", async () => {
    s.register("job", handler);
    expect(s.scheduleIfAbsent("job", at(1_000), "a")).toBe(true);
    expect(s.scheduleIfAbsent("job", at(9_000), "b")).toBe(false);
    await s.runDue(at(1_000));
    expect(calls).toEqual([{ key: "job", payload: "a" }]);
  });

  it("every inserts at now + interval, then only updates the interval", async () => {
    s.register("tick", handler);
    s.every("tick", 1_000);
    expect(s.nextDueAt()).toEqual(at(1_000));
    clock.advance(500);
    s.every("tick", 2_000);
    expect(s.nextDueAt()).toEqual(at(1_000));
    await s.runDue(at(1_000));
    expect(s.nextDueAt()).toEqual(at(3_000));
  });

  it("every honours firstDueAt", () => {
    s.every("tick", 1_000, at(10));
    expect(s.nextDueAt()).toEqual(at(10));
  });

  it("advances recurring jobs before running the handler", async () => {
    let seenNext: Date | null = null;
    s.register("tick", () => {
      seenNext = s.nextDueAt();
    });
    s.every("tick", 1_000, at(0));
    await s.runDue(at(0));
    expect(seenNext).toEqual(at(1_000));
    expect(s.has("tick")).toBe(true);
  });

  it("deletes one-shots before running so the handler can re-schedule its own key", async () => {
    s.register("job", () => {
      expect(s.has("job")).toBe(false);
      s.schedule("job", at(2_000));
    });
    s.schedule("job", at(0));
    await s.runDue(at(0));
    expect(s.has("job")).toBe(true);
    expect(s.nextDueAt()).toEqual(at(2_000));
  });

  it("a failing handler does not stop later jobs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    s.register("bad", () => {
      throw new Error("boom");
    });
    s.register("good", handler);
    s.schedule("bad", at(0));
    s.schedule("good", at(1));
    const { ran } = await s.runDue(at(10));
    expect(ran).toEqual(["bad", "good"]);
    expect(calls.map((c) => c.key)).toEqual(["good"]);
  });

  it("ignores re-entrant runDue calls", async () => {
    let inner: { ran: string[] } | undefined;
    s.register("job", async () => {
      inner = await s.runDue(at(100));
    });
    s.schedule("job", at(0));
    s.schedule("other", at(1));
    s.register("other", handler);
    await s.runDue(at(100));
    expect(inner).toEqual({ ran: [] });
    expect(calls.map((c) => c.key)).toEqual(["other"]);
  });

  it("dispatches by exact key first, then by prefix before the first colon", async () => {
    const exact: string[] = [];
    s.register("summary", handler);
    s.register("summary:special", ({ key }) => {
      exact.push(key);
    });
    s.schedule("summary:room-1", at(0), { r: 1 });
    s.schedule("summary:special", at(1));
    await s.runDue(at(5));
    expect(calls).toEqual([{ key: "summary:room-1", payload: { r: 1 } }]);
    expect(exact).toEqual(["summary:special"]);
  });

  it("cancel removes a job; nextDueAt is null when empty", async () => {
    s.register("job", handler);
    s.schedule("job", at(0));
    s.cancel("job");
    expect(s.has("job")).toBe(false);
    expect(s.nextDueAt()).toBeNull();
    expect((await s.runDue(at(10))).ran).toEqual([]);
  });

  it("runs due jobs in due-time order and skips future ones", async () => {
    s.register("a", handler);
    s.register("b", handler);
    s.register("c", handler);
    s.schedule("b", at(20));
    s.schedule("a", at(10));
    s.schedule("c", at(999));
    expect((await s.runDue(at(50))).ran).toEqual(["a", "b"]);
  });
});

describe("SqliteScheduler specifics", () => {
  it("notifies when the next due time changes", () => {
    const changes: Array<Date | null> = [];
    const s = new SqliteScheduler(freshDb(), new FixedClock(T0), (n) => changes.push(n));
    s.schedule("job", at(5));
    s.schedule("early", at(1));
    s.cancel("early");
    s.cancel("job");
    expect(changes).toEqual([at(5), at(1), at(5), null]);
  });

  it("ensureRecurring registers every recurring job and is idempotent", () => {
    const s = new SqliteScheduler(freshDb(), new FixedClock(T0), () => undefined);
    s.ensureRecurring();
    s.ensureRecurring();
    for (const job of RECURRING_JOBS) expect(s.has(job.key)).toBe(true);
    expect(s.nextDueAt()).toEqual(at(15_000));
  });

  it("persists across scheduler instances over the same db", async () => {
    const db = freshDb();
    new SqliteScheduler(db, new FixedClock(T0), () => undefined).schedule("job", at(0), { x: 1 });
    const second = new SqliteScheduler(db, new FixedClock(T0), () => undefined);
    const seen: unknown[] = [];
    second.register("job", ({ payload }) => {
      seen.push(payload);
    });
    await second.runDue(at(0));
    expect(seen).toEqual([{ x: 1 }]);
  });
});
