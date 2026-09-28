import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { buildDisputeService, buildPhotoVerificationService, freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { PresenceService } from "../presence/presence.service.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { QrService } from "../qr/qr.service.js";
import type { SeatPhotoVerifier, SeatPhotoVerifierRequest, SeatPhotoVerifierResult } from "../verification/seat-photo-verifier.js";
import { CheckInService } from "./checkins.service.js";
import { PhotoVerificationService } from "./photo-verification.service.js";

// A minimal-but-valid JPEG signature (FF D8 FF ...) — enough to pass the magic-byte check without
// needing a real decodable image.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const JPEG_BASE64 = JPEG_BYTES.toString("base64");
const PNG_MAGIC_ONLY_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

class StubVerifier implements SeatPhotoVerifier {
  constructor(private readonly impl: (req: SeatPhotoVerifierRequest) => Promise<SeatPhotoVerifierResult>) {}
  verify(req: SeatPhotoVerifierRequest): Promise<SeatPhotoVerifierResult> {
    return this.impl(req);
  }
}

async function buildCheckIns(db: Db): Promise<CheckInService> {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const security = new SecurityEventService(db, new ReputationService(db));
  const studySessions = new StudySessionService(db);
  return new CheckInService(db, roomState, presence, security, studySessions, new QrService(db), buildDisputeService(db));
}

describe("PhotoVerificationService", () => {
  let db: Db;
  let checkIns: CheckInService;
  let roomId: string;
  let roomSlug: string;
  let seatIds: string[];
  let seatCodes: string[];
  let location: { latitude: number; longitude: number; accuracy: number; capturedAt: string };
  let image: { mimeType: "image/jpeg"; base64: string };

  beforeEach(async () => {
    db = await freshDb();
    checkIns = await buildCheckIns(db);
    const room = await getRoom(db);
    roomId = room.id;
    roomSlug = room.slug;
    location = { latitude: room.latitude, longitude: room.longitude, accuracy: 10, capturedAt: new Date().toISOString() };
    const seats = await getSeats(db);
    seatIds = seats.map((s) => s.id);
    seatCodes = seats.map((s) => s.code);
    image = { mimeType: "image/jpeg", base64: JPEG_BASE64 };
    await insertUsers(db, ["u1", "u2"]);
  });

  function svc(verifier: SeatPhotoVerifier | null): PhotoVerificationService {
    return buildPhotoVerificationService(db, verifier);
  }

  it("verifies a check-in when the model agrees with the claimed seat above the confidence threshold", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.9, modelVersion: "test-v1" })));

    const { result, changes } = await service.verify({ userId: "u1", checkInId: checkIn.id, image, location });

    expect(result.verified).toBe(true);
    expect(result.reason).toBe("VERIFIED");
    expect(result.checkIn.verifiedAt).not.toBeNull();
    expect(result.checkIn.verificationExpiresAt).not.toBeNull();
    expect(changes.some((c) => c.seatId === seatIds[0] && c.verified)).toBe(true);

    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.verifierModel).toBe("test-v1");
    expect(row?.verificationConfidence).toBeCloseTo(0.9, 5);
    expect(row?.verificationPhotoSha256).toHaveLength(64);
  });

  it("does not verify when the model predicts a different seat", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const otherSeatCode = seatCodes.find((c) => c !== seatCodes[0]) ?? seatCodes[1]!;
    const service = svc(new StubVerifier(async () => ({ seatCode: otherSeatCode, confidence: 0.95, modelVersion: "test-v1" })));

    const { result, changes } = await service.verify({ userId: "u1", checkInId: checkIn.id, image, location });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("SEAT_MISMATCH");
    expect(changes).toHaveLength(0);
    const [row] = await db.select().from(schema.checkIns).where(eq(schema.checkIns.id, checkIn.id));
    expect(row?.verifiedAt).toBeNull();
  });

  it("does not verify when confidence is below the minimum threshold", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.5, modelVersion: "test-v1" })));

    const { result } = await service.verify({ userId: "u1", checkInId: checkIn.id, image, location });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("LOW_CONFIDENCE");
  });

  it("does not verify when the model can't tell (null prediction)", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(new StubVerifier(async () => ({ seatCode: null, confidence: 0, modelVersion: "test-v1" })));

    const { result } = await service.verify({ userId: "u1", checkInId: checkIn.id, image, location });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NO_PREDICTION");
  });

  it("does not penalise the user when the verifier call fails", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(
      new StubVerifier(async () => {
        throw new Error("network error");
      }),
    );

    const { result } = await service.verify({ userId: "u1", checkInId: checkIn.id, image, location });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("VERIFIER_ERROR");
  });

  it("rejects a photo whose bytes were already used to verify another user's check-in", async () => {
    const { checkIn: c1 } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { checkIn: c2 } = await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    const agreeing = new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" }));

    await svc(agreeing).verify({ userId: "u1", checkInId: c1.id, image, location });

    await expect(svc(agreeing).verify({ userId: "u2", checkInId: c2.id, image, location })).rejects.toMatchObject({
      code: "PHOTO_REUSED",
    });
  });

  it("rejects the same user reusing the same photo bytes on a new check-in", async () => {
    const agreeing = new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" }));
    const { checkIn: c1 } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await svc(agreeing).verify({ userId: "u1", checkInId: c1.id, image, location });

    // Check out and back in (into a different seat) to get a second, unverified check-in.
    await checkIns.checkOut("u1");
    const { checkIn: c2 } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[1]!, location, showIdentity: false });

    await expect(svc(agreeing).verify({ userId: "u1", checkInId: c2.id, image, location })).rejects.toMatchObject({
      code: "PHOTO_REUSED",
    });
  });

  it("rejects a second photo for the same check-in even after the protection window would have lapsed", async () => {
    const agreeing = new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" }));
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    await svc(agreeing).verify({ userId: "u1", checkInId: checkIn.id, image, location });

    // A different, unused photo — proves the rejection is about the check-in already being
    // verified, not about hash reuse.
    const otherImage = { mimeType: "image/jpeg" as const, base64: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03]).toString("base64") };
    await expect(svc(agreeing).verify({ userId: "u1", checkInId: checkIn.id, image: otherImage, location })).rejects.toMatchObject({
      code: "ALREADY_VERIFIED",
    });
  });

  it("rejects a photo whose bytes don't match the declared mime type", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" })));

    await expect(
      service.verify({ userId: "u1", checkInId: checkIn.id, image: { mimeType: "image/jpeg", base64: PNG_MAGIC_ONLY_BASE64 }, location }),
    ).rejects.toMatchObject({ code: "PHOTO_INVALID" });
  });

  it("maps a genuine race on the photo hash (both requests pass the reuse check) to PHOTO_REUSED via the unique index", async () => {
    const { checkIn: c1 } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const { checkIn: c2 } = await checkIns.checkIn({ userId: "u2", roomId, seatId: seatIds[1]!, location, showIdentity: false });
    // A tick of delay so both requests' reuse-check SELECTs (which run before either UPDATE) land
    // before either write — reproducing the race the app-level check alone can't close, which the
    // `uq_check_ins_verification_photo_sha256` unique index closes.
    const agreeing = new StubVerifier(async (req) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" };
    });

    const [r1, r2] = await Promise.allSettled([
      svc(agreeing).verify({ userId: "u1", checkInId: c1.id, image, location }),
      svc(agreeing).verify({ userId: "u2", checkInId: c2.id, image, location }),
    ]);

    const outcomes = [r1, r2];
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    expect(rejected?.reason).toMatchObject({ code: "PHOTO_REUSED" });
  });

  it("rejects a photo submitted for a check-in that doesn't belong to the caller", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(new StubVerifier(async (req) => ({ seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" })));

    await expect(service.verify({ userId: "u2", checkInId: checkIn.id, image, location })).rejects.toMatchObject({
      code: "NO_ACTIVE_CHECKIN",
    });
  });

  it("answers VERIFIER_UNAVAILABLE (503) when no verifier is configured", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    const service = svc(null);

    await expect(service.verify({ userId: "u1", checkInId: checkIn.id, image, location })).rejects.toMatchObject({
      code: "VERIFIER_UNAVAILABLE",
    });
  });

  it("passes the room's full seat layout to the verifier", async () => {
    const { checkIn } = await checkIns.checkIn({ userId: "u1", roomId, seatId: seatIds[0]!, location, showIdentity: false });
    let seenSeatCount = 0;
    let seenRoomSlug = "";
    const service = svc(
      new StubVerifier(async (req) => {
        seenSeatCount = req.seats.length;
        seenRoomSlug = req.roomSlug;
        return { seatCode: req.claimedSeatCode, confidence: 0.95, modelVersion: "test-v1" };
      }),
    );

    await service.verify({ userId: "u1", checkInId: checkIn.id, image, location });

    expect(seenSeatCount).toBe(seatIds.length);
    expect(seenRoomSlug).toBe(roomSlug);
  });
});
