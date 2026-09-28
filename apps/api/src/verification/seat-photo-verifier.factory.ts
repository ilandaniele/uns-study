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
    return new MockSeatPhotoVerifier();
  }
  if (env.seatVerifierUrl) {
    return new HttpSeatPhotoVerifier(env.seatVerifierUrl, env.seatVerifierToken || undefined);
  }
  return null;
}
