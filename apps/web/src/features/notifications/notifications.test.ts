import { describe, expect, it } from "vitest";
import type { AnnouncementDto } from "@sala/contracts";
import { CACHE_TTL_MS, hasUnseen, isCacheFresh, markSeen, readCache, readSeenIds, writeCache, type KeyValueStore } from "./notifications";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

const ann = (id: string): AnnouncementDto => ({ id, roomId: null, title: "t", body: "b", startsAt: "2026-01-01T00:00:00Z", endsAt: null, active: true });

describe("notifications", () => {
  it("computes unseen", () => {
    expect(hasUnseen([ann("a"), ann("b")], new Set(["a"]))).toBe(true);
    expect(hasUnseen([ann("a")], new Set(["a"]))).toBe(false);
    expect(hasUnseen([], new Set())).toBe(false);
  });

  it("persists seen ids and merges", () => {
    const s = memoryStore();
    markSeen(s, ["a"]);
    expect([...markSeen(s, ["b"])].sort()).toEqual(["a", "b"]);
    expect([...readSeenIds(s)].sort()).toEqual(["a", "b"]);
  });

  it("survives corrupt or unavailable storage", () => {
    const s = memoryStore();
    s.setItem("sala.announcements.seen", "{nope");
    expect(readSeenIds(s).size).toBe(0);
    expect(readSeenIds(brokenStore).size).toBe(0);
    expect(() => markSeen(brokenStore, ["a"])).not.toThrow();
    expect(readCache(brokenStore)).toBeNull();
    expect(readSeenIds(null).size).toBe(0);
  });

  it("cache respects the TTL", () => {
    const cache = { fetchedAt: 1000, items: [ann("a")] };
    expect(isCacheFresh(cache, 1000 + CACHE_TTL_MS - 1)).toBe(true);
    expect(isCacheFresh(cache, 1000 + CACHE_TTL_MS)).toBe(false);
    expect(isCacheFresh(null, 0)).toBe(false);
  });

  it("round-trips the cache and rejects malformed data", () => {
    const s = memoryStore();
    const cache = { fetchedAt: 5, items: [ann("a")] };
    writeCache(s, cache);
    expect(readCache(s)).toEqual(cache);
    s.setItem("sala.announcements.cache", JSON.stringify({ fetchedAt: "x" }));
    expect(readCache(s)).toBeNull();
  });
});
