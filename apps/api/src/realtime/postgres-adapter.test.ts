import { afterEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { attachPostgresAdapter, closeAdapterPool, postgresAdapterEnabled } from "./postgres-adapter.js";

const url = "postgres://u:p@localhost:5432/db";

describe("postgresAdapterEnabled", () => {
  it("is on only for the postgres adapter with a database url", () => {
    expect(postgresAdapterEnabled("postgres", url)).toBe(true);
    expect(postgresAdapterEnabled("memory", url)).toBe(false);
    expect(postgresAdapterEnabled("postgres", "")).toBe(false);
  });
});

describe("env.realtimeAdapter resolution", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });
  async function resolve(vars: Record<string, string | undefined>): Promise<string> {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
    return (await import("../env.js")).env.realtimeAdapter;
  }
  it("defaults to memory outside production", async () => {
    expect(await resolve({ NODE_ENV: "test", REALTIME_ADAPTER: undefined })).toBe("memory");
  });
  it("defaults to postgres in production", async () => {
    expect(await resolve({ NODE_ENV: "production", REALTIME_ADAPTER: undefined })).toBe("postgres");
  });
  it("honours an explicit override either way", async () => {
    expect(await resolve({ NODE_ENV: "test", REALTIME_ADAPTER: "postgres" })).toBe("postgres");
    expect(await resolve({ NODE_ENV: "production", REALTIME_ADAPTER: "memory" })).toBe("memory");
  });
});

describe("attachPostgresAdapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("installs the adapter and keeps the pool for shutdown", async () => {
    const end = vi.fn(async () => undefined);
    const pool = { end } as unknown as pg.Pool;
    const adapter = vi.fn();
    const io = { adapter: vi.fn() };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const createAdapter = vi.fn(() => adapter) as never;
    expect(attachPostgresAdapter(io, url, { createPool: () => pool, createAdapter })).toBe(true);
    expect(io.adapter).toHaveBeenCalledWith(adapter);
    await closeAdapterPool();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("falls back to in-memory (and releases the pool) when setup throws", () => {
    const end = vi.fn(async () => undefined);
    const pool = { end } as unknown as pg.Pool;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const io = { adapter: vi.fn() };
    const createAdapter = vi.fn(() => {
      throw new Error("boom");
    }) as never;
    expect(attachPostgresAdapter(io, url, { createPool: () => pool, createAdapter })).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({ evt: "realtime_adapter_setup_failed", fallback: "memory" });
  });

  it("does not hang shutdown when a client is still checked out (pool.end never resolves)", async () => {
    const end = vi.fn(() => new Promise<void>(() => undefined));
    const pool = { end } as unknown as pg.Pool;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    attachPostgresAdapter({ adapter: vi.fn() }, url, { createPool: () => pool, createAdapter: vi.fn(() => vi.fn()) as never });
    await closeAdapterPool(20);
    expect(end).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({ evt: "realtime_adapter_close_timeout", timeoutMs: 20 });
  });

  it("passes an error handler to the adapter that logs instead of staying silent", () => {
    const pool = { end: vi.fn(async () => undefined) } as unknown as pg.Pool;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const createAdapter = vi.fn((_pool: unknown, _opts: { errorHandler: (e: Error) => void }) => vi.fn());
    attachPostgresAdapter({ adapter: vi.fn() }, url, { createPool: () => pool, createAdapter: createAdapter as never });
    createAdapter.mock.calls[0]![1].errorHandler(new Error("notify failed"));
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({ evt: "realtime_adapter_error", msg: "notify failed" });
    return closeAdapterPool();
  });
});
