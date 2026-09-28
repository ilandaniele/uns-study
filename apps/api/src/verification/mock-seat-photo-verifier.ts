import type { SeatPhotoVerifier, SeatPhotoVerifierRequest, SeatPhotoVerifierResult } from "./seat-photo-verifier.js";

/** Dev/test stand-in (`SEAT_VERIFIER_MODE=mock`): always agrees with the claimed seat. */
export class MockSeatPhotoVerifier implements SeatPhotoVerifier {
  async verify(request: SeatPhotoVerifierRequest): Promise<SeatPhotoVerifierResult> {
    return { seatCode: request.claimedSeatCode, confidence: 0.9, modelVersion: "mock" };
  }
}
