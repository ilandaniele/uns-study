import { Controller, Get, Inject, Optional } from "@nestjs/common";
import type { SeatPhotoVerifier } from "./seat-photo-verifier.js";
import { SEAT_PHOTO_VERIFIER } from "./seat-photo-verifier.tokens.js";

/** Public: whether the seat photo verifier is configured, so the web only shows the button when it works. */
@Controller("verification")
export class VerificationController {
  constructor(@Optional() @Inject(SEAT_PHOTO_VERIFIER) private readonly verifier: SeatPhotoVerifier | null) {}

  @Get("status")
  status(): { enabled: boolean } {
    return { enabled: this.verifier !== null };
  }
}
