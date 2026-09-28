import { createHash } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { LocationInput, PhotoMimeType, PhotoVerificationResultDto } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { ApiErrors } from "../common/api-error.js";
import { stripImageMetadata } from "../common/image-metadata.js";
import { env } from "../env.js";
import { SEAT_PHOTO_VERIFIER } from "../verification/seat-photo-verifier.tokens.js";
import type { SeatPhotoVerifier } from "../verification/seat-photo-verifier.js";
import { presenceMessage, toDto } from "./checkins.service.js";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const UNIQUE_VIOLATION = "23505";

export interface VerifyCheckInPhotoInput {
  userId: string;
  checkInId: string;
  image: { mimeType: PhotoMimeType; base64: string };
  location: LocationInput;
}

/**
 * Orchestrates `POST /checkins/:id/photo`: presence + ownership checks, image decoding/validation,
 * reuse detection, and the call to the pluggable `SeatPhotoVerifier`. The photo bytes themselves
 * are never persisted or logged — only the verifier's verdict and a SHA-256 hash of the bytes (to
 * block reusing the same photo for a different user's check-in). See docs/SEAT_PHOTO_VERIFIER.md.
 */
@Injectable()
export class PhotoVerificationService {
  private readonly logger = new Logger(PhotoVerificationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Optional() @Inject(SEAT_PHOTO_VERIFIER) private readonly verifier: SeatPhotoVerifier | null,
  ) {}

  async verify(input: VerifyCheckInPhotoInput): Promise<{ result: PhotoVerificationResultDto; changes: SeatStateChange[] }> {
    if (!this.verifier) throw ApiErrors.verifierUnavailable();

    const [row] = await this.db
      .select({ checkIn: schema.checkIns, seatCode: schema.seats.code, room: schema.rooms })
      .from(schema.checkIns)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.checkIns.seatId))
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.checkIns.roomId))
      .where(eq(schema.checkIns.id, input.checkInId))
      .limit(1);
    if (!row || row.checkIn.userId !== input.userId || row.checkIn.status !== "ACTIVE") {
      throw ApiErrors.noActiveCheckIn();
    }
    // One verification per check-in — even after the protection window (VERIFIED_PROTECTION_MINUTES)
    // has lapsed, a check-in that has already been verified once cannot be verified again. A new
    // photo only counts for a fresh check-in (i.e. checking out and back in).
    if (row.checkIn.verifiedAt) throw ApiErrors.alreadyVerified();

    const presence = this.presence.validate(row.room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!));

    const decoded = decodeAndValidatePhoto(input.image);
    // Metadata (EXIF GPS, device identifiers, etc.) is stripped before anything else touches the
    // bytes — the hash below, and the bytes forwarded to the verifier, are both of the stripped
    // image, so nothing embedded in the original photo ever leaves this service.
    const bytes = stripImageMetadata(input.image.mimeType, decoded);
    const hash = createHash("sha256").update(bytes).digest("hex");
    // The canonical bytes (decoded, stripped, then re-encoded), not the client-supplied base64
    // string, are what gets hashed above and what gets forwarded to the verifier below — this way
    // whatever the model receives is exactly what was hashed and validated, not whatever
    // whitespace/padding the client happened to send.
    const canonicalImage = { mimeType: input.image.mimeType, base64: bytes.toString("base64") };

    // Any prior check-in (this user's or anyone else's) that was verified with the same photo bytes
    // blocks reuse — the same picture cannot verify two different check-ins.
    const [reused] = await this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(eq(schema.checkIns.verificationPhotoSha256, hash))
      .limit(1);
    if (reused) throw ApiErrors.photoReused();

    const seatRows = await this.db
      .select({ code: schema.seats.code, x: schema.seats.x, y: schema.seats.y, tableCode: schema.roomTables.code })
      .from(schema.seats)
      .innerJoin(schema.roomTables, eq(schema.roomTables.id, schema.seats.tableId))
      .where(and(eq(schema.seats.roomId, row.checkIn.roomId), eq(schema.seats.active, true)));

    const notVerified = (reason: PhotoVerificationResultDto["reason"]): { result: PhotoVerificationResultDto; changes: SeatStateChange[] } => ({
      result: { verified: false, reason, checkIn: toDto(row.checkIn, row.seatCode) },
      changes: [],
    });

    let prediction;
    try {
      prediction = await this.verifier.verify({
        roomSlug: row.room.slug,
        claimedSeatCode: row.seatCode,
        image: canonicalImage,
        seats: seatRows,
      });
    } catch (err) {
      // Log only the error message — never the request (which carries the photo) or the image itself.
      this.logger.warn(`Seat verifier call failed: ${err instanceof Error ? err.message : String(err)}`);
      return notVerified("VERIFIER_ERROR");
    }

    if (prediction.seatCode == null) return notVerified("NO_PREDICTION");
    if (prediction.seatCode !== row.seatCode) return notVerified("SEAT_MISMATCH");
    if (prediction.confidence < env.seatVerifierMinConfidence) return notVerified("LOW_CONFIDENCE");

    const now = new Date();
    let updated;
    try {
      [updated] = await this.db
        .update(schema.checkIns)
        .set({
          verifiedAt: now,
          verificationConfidence: prediction.confidence,
          verifierModel: prediction.modelVersion,
          verificationPhotoSha256: hash,
          updatedAt: now,
        })
        .where(eq(schema.checkIns.id, row.checkIn.id))
        .returning();
    } catch (err) {
      // A concurrent request verified a different check-in with the same photo bytes between the
      // reuse check above and this write — the unique index on verification_photo_sha256 is the
      // final word on it.
      if (isUniqueViolation(err)) throw ApiErrors.photoReused();
      throw err;
    }
    if (!updated) throw new Error("Check-in vanished during verification");

    const changes = await this.roomState.recomputeSeats([row.checkIn.seatId], {
      roomId: row.checkIn.roomId,
      now,
      eventType: "PHOTO_VERIFIED",
      actingUserId: input.userId,
    });

    return { result: { verified: true, reason: "VERIFIED", checkIn: toDto(updated, row.seatCode) }, changes };
  }
}

/** Postgres reports this SQLSTATE for a unique-constraint violation (or on its wrapped `cause`). */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === UNIQUE_VIOLATION;
}

/** JPEG/PNG/WEBP magic-byte signatures — a mismatch with the declared `mimeType` means the bytes
 *  don't actually contain what the client claims, regardless of what it said. */
function matchesMagicBytes(bytes: Buffer, mimeType: PhotoMimeType): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= sig.length && bytes.subarray(0, sig.length).equals(sig);
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function decodeAndValidatePhoto(image: { mimeType: PhotoMimeType; base64: string }): Buffer {
  const bytes = Buffer.from(image.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw ApiErrors.photoInvalid();
  if (!matchesMagicBytes(bytes, image.mimeType)) throw ApiErrors.photoInvalid();
  return bytes;
}
