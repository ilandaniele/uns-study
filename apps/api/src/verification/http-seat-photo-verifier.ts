import { z } from "zod";
import type { SeatPhotoVerifier, SeatPhotoVerifierRequest, SeatPhotoVerifierResult } from "./seat-photo-verifier.js";

const VERIFY_TIMEOUT_MS = 10_000;

const responseSchema = z.object({
  seatCode: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
});

/** Calls the external seat verifier model over HTTP — see docs/SEAT_PHOTO_VERIFIER.md. */
export class HttpSeatPhotoVerifier implements SeatPhotoVerifier {
  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {}

  async verify(request: SeatPhotoVerifierRequest): Promise<SeatPhotoVerifierResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      // Never follow a redirect to an attacker-controlled host with the photo bytes in the body.
      redirect: "error",
    });
    if (!res.ok) throw new Error(`Seat verifier responded ${res.status}`);
    return responseSchema.parse(await res.json());
  }
}
