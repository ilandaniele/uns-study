import { Module } from "@nestjs/common";
import { createSeatPhotoVerifier } from "./seat-photo-verifier.factory.js";
import { SEAT_PHOTO_VERIFIER } from "./seat-photo-verifier.tokens.js";
import { VerificationController } from "./verification.controller.js";

@Module({
  controllers: [VerificationController],
  providers: [{ provide: SEAT_PHOTO_VERIFIER, useFactory: createSeatPhotoVerifier }],
  exports: [SEAT_PHOTO_VERIFIER],
})
export class VerificationModule {}
