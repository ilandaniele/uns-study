import type { PhotoMimeType } from "@sala/contracts";
import type { VerifierFailure } from "./verifier-error.js";

export interface SeatPhotoVerifierSeat {
  code: string;
  tableCode: string;
  x: number;
  y: number;
}

export interface SeatPhotoVerifierRequest {
  roomSlug: string;
  claimedSeatCode: string;
  image: { mimeType: PhotoMimeType; base64: string };
  seats: SeatPhotoVerifierSeat[];
}

export interface SeatPhotoVerifierResult {
  failure?: VerifierFailure;
  /** The model's predicted seat, or `null` when it can't tell. */
  seatCode: string | null;
  confidence: number;
  modelVersion: string;
}

/** Contract for the external seat verifier model — see docs/SEAT_PHOTO_VERIFIER.md. */
export interface SeatPhotoVerifier {
  verify(request: SeatPhotoVerifierRequest): Promise<SeatPhotoVerifierResult>;
  diagnostics?(): { provider: "gemini" | "anthropic"; model: string; lastAttemptAt: string | null; lastFailure: VerifierFailure | null };
}
