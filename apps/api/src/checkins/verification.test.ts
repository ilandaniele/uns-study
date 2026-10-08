import { describe, expect, it } from "vitest";
import { VERIFIED_PROTECTION_MINUTES } from "@sala/contracts";
import { computeVerificationExpiresAt, isCheckInVerified } from "./verification.js";

const MIN = 60_000;

describe("photo verification protection", () => {
  const verifiedAt = new Date("2026-05-04T12:00:00Z");

  it("lasts 2 hours from the photo", () => {
    expect(VERIFIED_PROTECTION_MINUTES).toBe(120);
    const checkInExpiresAt = new Date(verifiedAt.getTime() + 170 * MIN);
    expect(computeVerificationExpiresAt(verifiedAt, checkInExpiresAt)).toEqual(new Date(verifiedAt.getTime() + 120 * MIN));
    expect(isCheckInVerified(verifiedAt, checkInExpiresAt, new Date(verifiedAt.getTime() + 119 * MIN))).toBe(true);
    expect(isCheckInVerified(verifiedAt, checkInExpiresAt, new Date(verifiedAt.getTime() + 121 * MIN))).toBe(false);
  });

  it("ends with the check-in when that comes first", () => {
    const checkInExpiresAt = new Date(verifiedAt.getTime() + 45 * MIN);
    expect(computeVerificationExpiresAt(verifiedAt, checkInExpiresAt)).toEqual(checkInExpiresAt);
    expect(isCheckInVerified(verifiedAt, checkInExpiresAt, new Date(verifiedAt.getTime() + 46 * MIN))).toBe(false);
  });

  it("renewing the check-in (\"Sigo acá\") never pushes it past 2 hours from the photo", () => {
    // Renewed 100 minutes after the photo: the check-in now runs another 180 minutes.
    const renewedExpiresAt = new Date(verifiedAt.getTime() + (100 + 180) * MIN);
    expect(computeVerificationExpiresAt(verifiedAt, renewedExpiresAt)).toEqual(new Date(verifiedAt.getTime() + 120 * MIN));
    expect(isCheckInVerified(verifiedAt, renewedExpiresAt, new Date(verifiedAt.getTime() + 121 * MIN))).toBe(false);
  });

  it("is off without a photo", () => {
    expect(isCheckInVerified(null, new Date(verifiedAt.getTime() + 60 * MIN), verifiedAt)).toBe(false);
  });
});
