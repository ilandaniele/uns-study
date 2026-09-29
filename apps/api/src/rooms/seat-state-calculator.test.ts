import { describe, expect, it } from "vitest";
import { calculateSeatState } from "./seat-state-calculator.js";

const now = new Date("2026-01-01T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("calculateSeatState", () => {
  it("returns UNKNOWN with no signals", () => {
    expect(calculateSeatState({ hasActiveCheckIn: false, observations: [] })).toEqual({
      status: "UNKNOWN",
      confidence: 0,
      sourceSummary: "NONE",
    });
  });

  it("prioritizes an active check-in over any observations", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: true,
      observations: [{ userId: "u1", status: "FREE", weight: 1, observedAt: now }],
    });
    expect(result.status).toBe("OCCUPIED");
    expect(result.confidence).toBe(0.98);
    expect(result.sourceSummary).toBe("CHECK_IN");
  });

  it("derives FREE from a single observation", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [{ userId: "u1", status: "FREE", weight: 1, observedAt: now }],
    });
    expect(result.status).toBe("FREE");
    expect(result.confidence).toBeCloseTo(0.5, 5);
  });

  it("increases FREE confidence with more distinct users, capped at 0.9", () => {
    const observations = ["u1", "u2", "u3", "u4"].map((userId, i) => ({
      userId,
      status: "FREE" as const,
      weight: 1,
      observedAt: minutesAgo(i),
    }));
    const result = calculateSeatState({ hasActiveCheckIn: false, observations });
    expect(result.status).toBe("FREE");
    expect(result.confidence).toBeCloseTo(Math.min(0.5 + 0.15 * 3, 0.9), 5);
  });

  it("derives OCCUPIED from a single observation", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [{ userId: "u1", status: "OCCUPIED", weight: 1, observedAt: now }],
    });
    expect(result.status).toBe("OCCUPIED");
    expect(result.sourceSummary).toBe("OBSERVATION_OCCUPIED");
  });

  it("counts only the latest observation per user (distinct users)", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "FREE", weight: 1, observedAt: minutesAgo(5) },
        { userId: "u1", status: "FREE", weight: 1, observedAt: minutesAgo(1) }, // same user, newer
      ],
    });
    expect(result.confidence).toBeCloseTo(0.5, 5); // n=1, not 2
  });

  it("resolves a conflict in favor of the dominant, freshest side (>=2x)", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "OCCUPIED", weight: 1, observedAt: minutesAgo(5) },
        { userId: "u2", status: "OCCUPIED", weight: 1, observedAt: minutesAgo(4) },
        { userId: "u3", status: "FREE", weight: 1, observedAt: minutesAgo(1) }, // newest, but minority
      ],
    });
    // FREE is newest but not >=2x dominant (1 vs 2) -> UNCERTAIN
    expect(result.status).toBe("UNCERTAIN");
    expect(result.confidence).toBe(0.4);
  });

  it("resolves a conflict when the dominant side is also the newest", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "OCCUPIED", weight: 1, observedAt: minutesAgo(5) },
        { userId: "u2", status: "OCCUPIED", weight: 1, observedAt: minutesAgo(1) }, // dominant + newest
        { userId: "u3", status: "FREE", weight: 1, observedAt: minutesAgo(8) },
      ],
    });
    expect(result.status).toBe("OCCUPIED");
    expect(result.confidence).toBe(0.5);
    expect(result.sourceSummary).toBe("OBSERVATION_CONFLICT_OCCUPIED");
  });

  it("falls back to UNCERTAIN when neither side dominates", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "OCCUPIED", weight: 1, observedAt: minutesAgo(2) },
        { userId: "u2", status: "FREE", weight: 1, observedAt: minutesAgo(1) },
      ],
    });
    expect(result.status).toBe("UNCERTAIN");
    expect(result.confidence).toBe(0.4);
  });

  it("an OPEN dispute overrides an active check-in to UNCERTAIN", () => {
    const result = calculateSeatState({ hasActiveCheckIn: true, observations: [], dispute: { status: "OPEN" } });
    expect(result).toEqual({ status: "UNCERTAIN", confidence: 0.5, sourceSummary: "DISPUTE" });
  });

  it("a TIED dispute keeps the check-in's seat UNCERTAIN at lower confidence", () => {
    const result = calculateSeatState({ hasActiveCheckIn: true, observations: [], dispute: { status: "TIED" } });
    expect(result).toEqual({ status: "UNCERTAIN", confidence: 0.4, sourceSummary: "DISPUTE_TIED" });
  });

  it("a TIED dispute without an active check-in is ignored", () => {
    const result = calculateSeatState({ hasActiveCheckIn: false, observations: [], dispute: { status: "TIED" } });
    expect(result.status).toBe("UNKNOWN");
  });

  it("derives SAVED from a SAVED observation alone", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [{ userId: "u1", status: "SAVED", weight: 1, observedAt: now }],
    });
    expect(result).toEqual({ status: "SAVED", confidence: 0.5, sourceSummary: "OBSERVATION_SAVED" });
  });

  it("SAVED vs FREE from different users with equal weight is UNCERTAIN", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "SAVED", weight: 1, observedAt: minutesAgo(2) },
        { userId: "u2", status: "FREE", weight: 1, observedAt: now },
      ],
    });
    expect(result.status).toBe("UNCERTAIN");
  });

  it("a dominant, newest SAVED report beats a lone FREE one", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "FREE", weight: 1, observedAt: minutesAgo(3) },
        { userId: "u2", status: "SAVED", weight: 3, observedAt: now },
      ],
    });
    expect(result.status).toBe("SAVED");
  });

  it("SAVED and OCCUPIED without FREE: the newest report decides", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: false,
      observations: [
        { userId: "u1", status: "OCCUPIED", weight: 1, observedAt: minutesAgo(5) },
        { userId: "u2", status: "SAVED", weight: 1, observedAt: now },
      ],
    });
    expect(result.status).toBe("SAVED");
  });

  it("an active check-in beats a SAVED observation", () => {
    const result = calculateSeatState({
      hasActiveCheckIn: true,
      observations: [{ userId: "u1", status: "SAVED", weight: 1, observedAt: now }],
    });
    expect(result.status).toBe("OCCUPIED");
    expect(result.sourceSummary).toBe("CHECK_IN");
  });

  it("a SAVED seat with its observation expired (filtered upstream) goes back to UNKNOWN", () => {
    expect(calculateSeatState({ hasActiveCheckIn: false, observations: [] }).status).toBe("UNKNOWN");
  });

  it("ignores expired observations (caller is expected to pre-filter by expiresAt)", () => {
    // The calculator itself is pure and trusts its input; expiry filtering happens upstream.
    // This test documents that an empty observation list (post-filter) yields UNKNOWN.
    const result = calculateSeatState({ hasActiveCheckIn: false, observations: [] });
    expect(result.status).toBe("UNKNOWN");
  });
});
