import { createDb, migrate, schema, seedInitialRoom, type Db } from "@uns/database";
import { PresenceService } from "./presence/presence.service.js";
import { RoomStateService } from "./rooms/room-state.service.js";
import { SecurityEventService } from "./security/security-event.service.js";
import { ReputationService } from "./reputation/reputation.service.js";
import { StudySessionService } from "./rankings/study-session.service.js";
import { RestrictionService } from "./users/restriction.service.js";
import { RoomRealtimeGateway } from "./realtime/room-realtime.gateway.js";
import { RateLimitService } from "./security/rate-limit.service.js";
import { AbusePolicyService } from "./security/abuse-policy.service.js";
import { TurnstileService } from "./security/turnstile.service.js";
import type { Auth } from "./auth/auth.instance.js";
import { DisputeService } from "./disputes/disputes.service.js";
import { PhotoVerificationService } from "./checkins/photo-verification.service.js";
import type { SeatPhotoVerifier } from "./verification/seat-photo-verifier.js";

export async function freshDb(): Promise<Db> {
  const db = createDb({ pgliteDir: "memory://" });
  await migrate(db, "");
  await seedInitialRoom(db);
  return db;
}

export async function insertUsers(db: Db, ids: string[], opts?: { createdAt?: Date }): Promise<void> {
  await db
    .insert(schema.user)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@example.test`, ...(opts?.createdAt ? { createdAt: opts.createdAt } : {}) })));
}

export async function getRoom(db: Db) {
  const [room] = await db.select().from(schema.rooms);
  if (!room) throw new Error("seed missing room");
  return room;
}

export async function getSeats(db: Db) {
  return db.select().from(schema.seats).orderBy(schema.seats.code);
}

const mockAuth = { api: { getSession: async () => null } } as unknown as Auth;

/** A fully-wired `DisputeService` for tests that only need `CheckInService` to compile — its own
 *  dispute-related tests build the graph explicitly instead, to keep instances easy to spy on. */
export function buildDisputeService(db: Db): DisputeService {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const reputation = new ReputationService(db);
  const security = new SecurityEventService(db, reputation);
  const studySessions = new StudySessionService(db);
  const restrictions = new RestrictionService(db);
  const gateway = new RoomRealtimeGateway(roomState, mockAuth); // no @WebSocketServer() attached — emits are no-ops in tests
  const rateLimit = new RateLimitService();
  const abusePolicy = new AbusePolicyService(db, new TurnstileService());
  return new DisputeService(db, roomState, presence, security, studySessions, reputation, restrictions, gateway, rateLimit, abusePolicy);
}

/** A `PhotoVerificationService` wired with the given (possibly `null`) verifier stand-in. */
export function buildPhotoVerificationService(db: Db, verifier: SeatPhotoVerifier | null): PhotoVerificationService {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  return new PhotoVerificationService(db, roomState, presence, verifier);
}
