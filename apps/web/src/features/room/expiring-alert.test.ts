import { describe, expect, it } from "vitest";
import { isExpiringAlertFor } from "./expiring-alert";

const checkIn = { id: "c1", expiresAt: "2026-01-01T10:00:00.000Z" };
const event = { checkInId: "c1", seatId: "s1", expiresAt: "2026-01-01T10:00:00.000Z" };

describe("isExpiringAlertFor", () => {
  it("matches the same check-in and expiry", () => {
    expect(isExpiringAlertFor(event, checkIn)).toBe(true);
  });
  it("ignores no event, another check-in, or an extended expiry", () => {
    expect(isExpiringAlertFor(null, checkIn)).toBe(false);
    expect(isExpiringAlertFor({ ...event, checkInId: "c2" }, checkIn)).toBe(false);
    expect(isExpiringAlertFor(event, { ...checkIn, expiresAt: "2026-01-01T11:00:00.000Z" })).toBe(false);
  });
});
