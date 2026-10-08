import { VERIFIED_PROTECTION_MINUTES } from "@sala/contracts";

/**
 * When a verified check-in's photo protection ends: `VERIFIED_PROTECTION_MINUTES` after the
 * photo, capped by the check-in's own expiry (protection never outlives the check-in itself).
 * Anchored on `verifiedAt`, so "Sigo acá" can keep the check-in alive but never pushes the
 * protection past 2 hours from the photo.
 */
export function computeVerificationExpiresAt(verifiedAt: Date, checkInExpiresAt: Date): Date {
  const protectionEnd = new Date(verifiedAt.getTime() + VERIFIED_PROTECTION_MINUTES * 60_000);
  return protectionEnd < checkInExpiresAt ? protectionEnd : checkInExpiresAt;
}

/** True while a check-in's photo-verification protection is still active. */
export function isCheckInVerified(verifiedAt: Date | null, checkInExpiresAt: Date, now: Date = new Date()): boolean {
  if (!verifiedAt) return false;
  return computeVerificationExpiresAt(verifiedAt, checkInExpiresAt).getTime() > now.getTime();
}
