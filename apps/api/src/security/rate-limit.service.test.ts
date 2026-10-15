import { describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@sala/database";
import { freshDb } from "../test-utils.js";
import { IN_MEMORY_MAX_WINDOW_SECONDS, MemoryWindowCounter, RateLimitService, SqliteWindow } from "./rate-limit.service.js";

describe("RateLimitService (in-memory fallback)", () => {
  it("allows up to the limit within the window, then blocks", async () => {
    const svc = new RateLimitService();
    const key = "test:user1";
    for (let i = 0; i < 5; i++) {
      const result = await svc.check(key, 5, 60);
      expect(result.allowed).toBe(true);
    }
    const blocked = await svc.check(key, 5, 60);
    expect(blocked.allowed).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const svc = new RateLimitService();
    await svc.check("a", 1, 60);
    const resultB = await svc.check("b", 1, 60);
    expect(resultB.allowed).toBe(true);
  });
});

describe("RateLimitService (SQLite)", () => {
  it("persists long windows in rate_limit_hits", async () => {
    const db = freshDb();
    const svc = new RateLimitService(db);
    const long = IN_MEMORY_MAX_WINDOW_SECONDS + 1;
    expect((await svc.check("k", 2, long)).allowed).toBe(true);
    expect((await svc.check("k", 2, long)).allowed).toBe(true);
    expect((await svc.check("k", 2, long)).allowed).toBe(false);
    expect(db.select().from(schema.rateLimitHits).all().length).toBeGreaterThan(0);
  });

  it("counts short windows in memory without writing rate_limit_hits", async () => {
    const db = freshDb();
    const svc = new RateLimitService(db);
    expect((await svc.check("k", 2, 60)).allowed).toBe(true);
    expect((await svc.check("k", 2, 60)).allowed).toBe(true);
    expect((await svc.check("k", 2, 60)).allowed).toBe(false);
    expect((await svc.check("other", 2, IN_MEMORY_MAX_WINDOW_SECONDS)).allowed).toBe(true);
    expect(db.select().from(schema.rateLimitHits).all()).toHaveLength(0);
  });
});

describe("MemoryWindowCounter", () => {
  it("enforces the limit and rolls over once windows elapse", () => {
    const counter = new MemoryWindowCounter();
    const t = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 3; i++) expect(counter.check("k", 3, 1_000, t).allowed).toBe(true);
    expect(counter.check("k", 3, 1_000, t).allowed).toBe(false);
    expect(counter.check("k", 3, 1_000, t + 2_000).allowed).toBe(true);
  });

  it("weighs the previous window like the SQLite version", () => {
    const counter = new MemoryWindowCounter();
    const t = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 4; i++) expect(counter.check("k", 4, 60_000, t + i).allowed).toBe(true);
    expect(counter.check("k", 4, 60_000, t + 60_001).allowed).toBe(false);
    expect(counter.check("k", 4, 60_000, t + 120_000 - 1).allowed).toBe(true);
  });
});

describe("SqliteWindow", () => {
  function makeWindow(): { window: SqliteWindow; db: Db } {
    const db = freshDb();
    return { window: new SqliteWindow(db), db };
  }

  it("allows up to the limit within a fixed window, then blocks", () => {
    const { window } = makeWindow();
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      expect(window.check("test:user1", 5, 60_000, now).allowed).toBe(true);
    }
    expect(window.check("test:user1", 5, 60_000, now).allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const { window } = makeWindow();
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    window.check("a", 1, 60_000, now);
    expect(window.check("b", 1, 60_000, now).allowed).toBe(true);
  });

  it("weighs the previous window count by its remaining overlap (sliding window counter)", () => {
    const { window } = makeWindow();
    const windowMs = 60_000;
    const windowStart = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      expect(window.check("k", 4, windowMs, windowStart + i).allowed).toBe(true);
    }
    // Just after rollover the previous window still weighs ~100%, so a new hit is rejected.
    expect(window.check("k", 4, windowMs, windowStart + windowMs + 1).allowed).toBe(false);
    // Near the end of the next window the previous overlap has decayed to ~0.
    expect(window.check("k", 4, windowMs, windowStart + windowMs * 2 - 1).allowed).toBe(true);
  });

  it("windows expire once fully elapsed", () => {
    const { window } = makeWindow();
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 3; i++) expect(window.check("k", 3, 1_000, start).allowed).toBe(true);
    expect(window.check("k", 3, 1_000, start).allowed).toBe(false);
    expect(window.check("k", 3, 1_000, start + 2_000).allowed).toBe(true);
  });

  it("prunes windows older than a day, at most once per minute", () => {
    const { window, db } = makeWindow();
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
    window.check("old", 5, 1_000, t0);
    const t1 = t0 + 25 * 60 * 60_000;
    window.check("new", 5, 1_000, t1); // more than a minute since the last cleanup: prunes "old"
    expect(db.select().from(schema.rateLimitHits).all().map((r) => r.key)).toEqual(["new"]);
    db.insert(schema.rateLimitHits).values({ key: "stale", windowStart: new Date(t0), count: 1 }).run();
    window.check("new", 5, 1_000, t1 + 10_000); // under a minute: no prune
    expect(db.select().from(schema.rateLimitHits).all().map((r) => r.key)).toContain("stale");
  });
});

describe("backend failures fail closed and are logged", () => {
  it("logs rate_limit_backend_error when the database throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new SqliteWindow({
      transaction: () => {
        throw new Error("db down");
      },
    } as unknown as Db);
    expect(broken.check("k", 5, 1000)).toEqual({ allowed: false, remaining: 0 });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({ evt: "rate_limit_backend_error", backend: "sqlite", msg: "db down" });
    spy.mockRestore();
  });
});
