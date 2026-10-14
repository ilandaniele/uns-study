import { PGlite } from "@electric-sql/pglite";
import { createDb, migrate, schema, seedInitialRoom, type Db } from "@sala/database";
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
import { NotificationService } from "./notifications/notification.service.js";
import { PushService } from "./notifications/push.service.js";

/**
 * Migrating PGlite takes over a second, so it happens once per test worker: the migrated and
 * seeded data directory is dumped, and every `freshDb()` boots its own database from that dump.
 */
let template: Promise<File | Blob> | undefined;

async function buildTemplate(): Promise<File | Blob> {
  const pglite = new PGlite("memory://");
  const db = createDb({ pglite });
  await migrate(db, "");
  await seedInitialRoom(db);
  const dump = await pglite.dumpDataDir("none");
  await pglite.close();
  return dump;
}

export async function freshDb(): Promise<Db> {
  template ??= buildTemplate();
  return createDb({ pglite: await PGlite.create({ loadDataDir: await template }) });
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

/** A `NotificationService` wired against a real db but with no VAPID keys configured, so its push
 *  side no-ops — good enough for tests that only need `RoomRealtimeGateway` to compile. */
export function buildNotificationService(db: Db): NotificationService {
  return new NotificationService(db, new PushService(db), new RoomStateService(db));
}

/** A fully-wired `DisputeService` for tests that only need `CheckInService` to compile — its own
 *  dispute-related tests build the graph explicitly instead, to keep instances easy to spy on. */
export function buildDisputeService(db: Db, notifications: NotificationService = buildNotificationService(db)): DisputeService {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  const reputation = new ReputationService(db);
  const security = new SecurityEventService(db, reputation);
  const studySessions = new StudySessionService(db);
  const restrictions = new RestrictionService(db);
  const gateway = new RoomRealtimeGateway(roomState, mockAuth, buildNotificationService(db), new RestrictionService(db)); // no @WebSocketServer() attached — emits are no-ops in tests
  const rateLimit = new RateLimitService();
  const abusePolicy = new AbusePolicyService(db, new TurnstileService());
  return new DisputeService(db, roomState, presence, security, studySessions, reputation, restrictions, gateway, rateLimit, abusePolicy, notifications);
}

/** A `PhotoVerificationService` wired with the given (possibly `null`) verifier stand-in. */
export function buildPhotoVerificationService(db: Db, verifier: SeatPhotoVerifier | null): PhotoVerificationService {
  const roomState = new RoomStateService(db);
  const presence = new PresenceService();
  return new PhotoVerificationService(db, roomState, presence, verifier);
}

/**
 * Runs `fn` and returns how many database round trips it issued (each statement is one; a
 * transaction adds two more for BEGIN/COMMIT, like a real Postgres connection would). Counts
 * globally while `fn` runs, so don't run other database work concurrently.
 */
export async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
  const { PglitePreparedQuery, PgliteSession } = await import("drizzle-orm/pglite/session");
  let queries = 0;
  const execute = PglitePreparedQuery.prototype.execute;
  const transaction = PgliteSession.prototype.transaction;
  PglitePreparedQuery.prototype.execute = function (this: unknown, ...args: never[]) {
    queries++;
    return (execute as (...a: never[]) => unknown).apply(this, args) as never;
  } as typeof execute;
  PgliteSession.prototype.transaction = function (this: unknown, ...args: never[]) {
    queries += 2;
    return (transaction as (...a: never[]) => unknown).apply(this, args) as never;
  } as typeof transaction;
  try {
    const result = await fn();
    return { result, queries };
  } finally {
    PglitePreparedQuery.prototype.execute = execute;
    PgliteSession.prototype.transaction = transaction;
  }
}
