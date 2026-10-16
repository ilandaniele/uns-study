import type { SeatDto } from "@sala/contracts";
import { describe, expect, it } from "vitest";
import { dueFavoriteToasts, favoriteToggleOutcome, freedFavorites, shouldMigrate, toggleFavoriteIds } from "./favorite-seats";

describe("favoriteToggleOutcome", () => {
  it("lets a free viewer star a first seat and un-star the current one", () => {
    expect(favoriteToggleOutcome([], "a", false)).toBe("add");
    expect(favoriteToggleOutcome(["a"], "a", false)).toBe("remove");
  });

  it("sends a free viewer to the upsell instead of replacing their favorite", () => {
    expect(favoriteToggleOutcome(["a"], "b", false)).toBe("upsell");
  });

  it("lets a Pro viewer add up to the max, then replace", () => {
    expect(favoriteToggleOutcome(["a"], "b", true)).toBe("add");
    expect(favoriteToggleOutcome(["a", "b", "c"], "d", true)).toBe("replace");
    expect(favoriteToggleOutcome(["a", "b"], "b", true)).toBe("remove");
  });
});

const seat = (id: string, status: SeatDto["status"]) => ({ id, status }) as SeatDto;
const map = (...seats: SeatDto[]) => ({ seats });

describe("freedFavorites", () => {
  it("reports favorites that turned FREE", () => {
    const prev = map(seat("a", "OCCUPIED"), seat("b", "OCCUPIED"), seat("c", "UNKNOWN"));
    const next = map(seat("a", "FREE"), seat("b", "OCCUPIED"), seat("c", "FREE"));
    expect(freedFavorites(prev, next, ["a", "b"])).toEqual(["a"]);
    expect(freedFavorites(prev, next, ["c"])).toEqual(["c"]);
  });

  it("ignores already-free seats, the first snapshot and non-favorites", () => {
    const free = map(seat("a", "FREE"));
    expect(freedFavorites(free, free, ["a"])).toEqual([]);
    expect(freedFavorites(null, free, ["a"])).toEqual([]);
    expect(freedFavorites(map(seat("a", "OCCUPIED")), map(seat("a", "FREE")), [])).toEqual([]);
  });
});

describe("dueFavoriteToasts", () => {
  it("skips seats announced within the cooldown", () => {
    const last = new Map([["a", 1_000]]);
    expect(dueFavoriteToasts(["a", "b"], last, 1_000 + 9 * 60_000)).toEqual(["b"]);
    expect(dueFavoriteToasts(["a", "b"], last, 1_000 + 10 * 60_000)).toEqual(["a", "b"]);
  });
});

describe("shouldMigrate", () => {
  it("migrates once, from a local favorite into an empty server list", () => {
    expect(shouldMigrate([], "a", null)).toBe(true);
    expect(shouldMigrate(["x"], "a", null)).toBe(false);
    expect(shouldMigrate([], null, null)).toBe(false);
    expect(shouldMigrate([], "a", "1")).toBe(false);
  });
});

describe("toggleFavoriteIds", () => {
  it("adds, removes and refuses past the cap", () => {
    expect(toggleFavoriteIds(["a"], "b", 3)).toEqual({ ids: ["a", "b"], full: false });
    expect(toggleFavoriteIds(["a", "b"], "a", 3)).toEqual({ ids: ["b"], full: false });
    expect(toggleFavoriteIds(["a", "b", "c"], "d", 3)).toEqual({ ids: ["a", "b", "c"], full: true });
  });
});
