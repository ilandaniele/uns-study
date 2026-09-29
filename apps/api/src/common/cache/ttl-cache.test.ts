import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./ttl-cache.js";

describe("TtlCache", () => {
  it("expires entries after the TTL", () => {
    let now = 1_000;
    const cache = new TtlCache<string, number>(100, () => now);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    now += 101;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("wrap loads once for concurrent callers and caches the result", async () => {
    const cache = new TtlCache<string, number>(1_000);
    const loader = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.wrap("k", loader), cache.wrap("k", loader)]);
    expect([a, b]).toEqual([42, 42]);
    await cache.wrap("k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("never caches a failed load", async () => {
    const cache = new TtlCache<string, number>(1_000);
    await expect(cache.wrap("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(cache.wrap("k", async () => 7)).resolves.toBe(7);
  });

  it("an invalidation during an in-flight load prevents the stale value from being cached", async () => {
    const cache = new TtlCache<string, string>(1_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = cache.wrap("k", async () => {
      await gate;
      return "stale";
    });
    cache.delete("k");
    release();
    await expect(pending).resolves.toBe("stale");
    expect(cache.get("k")).toBeUndefined();
  });

  it("deleteWhere drops matching entries only", () => {
    const cache = new TtlCache<string, number>(1_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.deleteWhere((v) => v === 1);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });
});
