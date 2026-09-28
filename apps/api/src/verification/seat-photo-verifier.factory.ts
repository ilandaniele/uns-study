import { env } from "../env.js";
import { HttpSeatPhotoVerifier } from "./http-seat-photo-verifier.js";
import { MockSeatPhotoVerifier } from "./mock-seat-photo-verifier.js";
import type { SeatPhotoVerifier } from "./seat-photo-verifier.js";

/**
 * Picks the configured `SeatPhotoVerifier`, or `null` when the feature is off. `null` disables the
 * whole feature: `GET /verification/status` reports it, and `POST /checkins/:id/photo` answers
 * `VERIFIER_UNAVAILABLE`.
 */
export function createSeatPhotoVerifier(): SeatPhotoVerifier | null {
  if (env.seatVerifierMode === "mock" && !env.isProduction) {
    console.warn(
      "[verification] SEAT_VERIFIER_MODE=mock — every submitted photo will be accepted as the claimed seat. Dev/test only.",
    );
    return new MockSeatPhotoVerifier();
  }
  if (env.seatVerifierUrl) {
    // Photo bytes go over this connection — an http:// (or otherwise non-https) endpoint in
    // production would ship them, and the Authorization bearer token, in the clear. Refuse to wire
    // it up at all rather than silently downgrade to an insecure call.
    if (env.isProduction && !env.seatVerifierUrl.startsWith("https://")) {
      console.warn(
        `[verification] SEAT_VERIFIER_URL is not an https:// URL in production (${env.seatVerifierUrl}) — the seat photo verifier is disabled.`,
      );
      return null;
    }
    return new HttpSeatPhotoVerifier(env.seatVerifierUrl, env.seatVerifierToken || undefined);
  }
  return null;
}
