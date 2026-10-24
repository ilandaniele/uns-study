import { describe, expect, it } from "vitest";
import type { DisputeVoteAvailableEvent } from "@sala/contracts";
import { eligibleVoteNotice } from "./vote-notices";

const now = Date.parse("2026-10-24T18:00:00Z");
const future = new Date(now + 300_000).toISOString();
const event: DisputeVoteAvailableEvent = { disputeId: "vote", roomId: "room", roomSlug: "principal", seatId: "other", seatCode: "M01-S01", closesAt: future };
const checkIn = { roomId: "room", seatId: "mine", expiresAt: future };

describe("vote invitations", () => {
  it("only surfaces another seat in the user's currently occupied room", () => {
    expect(eligibleVoteNotice(event, checkIn, now)).toBe(true);
    expect(eligibleVoteNotice(event, null, now)).toBe(false);
    expect(eligibleVoteNotice(event, { ...checkIn, roomId: "elsewhere" }, now)).toBe(false);
    expect(eligibleVoteNotice(event, { ...checkIn, seatId: "other" }, now)).toBe(false);
  });
  it("expires both when the vote closes and when the user's own seat expires", () => {
    expect(eligibleVoteNotice(event, checkIn, now + 300_000)).toBe(false);
    expect(eligibleVoteNotice(event, { ...checkIn, expiresAt: new Date(now).toISOString() }, now)).toBe(false);
    expect(eligibleVoteNotice({ ...event, closesAt: "invalid" }, checkIn, now)).toBe(false);
  });
});
