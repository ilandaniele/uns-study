import { readFileSync } from "node:fs";
import { schema, type Db } from "@sala/database";
import { createTestDb } from "@sala/database/testing";
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
import { DisputeService } from "./disputes/disputes.service.js";
import { PhotoVerificationService } from "./checkins/photo-verification.service.js";
import type { SeatPhotoVerifier } from "./verification/seat-photo-verifier.js";
import { NotificationService } from "./notifications/notification.service.js";
import { PushService } from "./notifications/push.service.js";
import { RecordingHub } from "./realtime/realtime-hub.js";
import { ManualScheduler } from "./platform/scheduler.js";
import { sampleStudyPresence } from "./presence/study-presence.js";

/** The migrated and seeded template that src/test-global-setup.ts serializes once per run. */
let template: Buffer | undefined;

/** Per-db statement counters (see `countQueries`); every `freshDb` db is registered. */
const counters = new WeakMap<Db, { n: number }>();

function createCounted(): Db {
  template ??= readFileSync(process.env.SALA_TEST_TEMPLATE ?? "");
  const counter = { n: 0 };
  const db = createTestDb({ template, logger: { logQuery: () => void counter.n++ } });
  counters.set(db, counter);
  return db;
}

export function freshDb(): Db;
export function freshDb(opts: { countQueries: true }): { db: Db; queries: () => number };
export function freshDb(opts?: { countQueries?: boolean }): Db | { db: Db; queries: () => number } {
  const db = createCounted();
  if (!opts?.countQueries) return db;
  const counter = counters.get(db)!;
  return { db, queries: () => counter.n };
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

/** Synthetic evidence for tests explicitly modeling uninterrupted physical presence. */
export function keepStudyingUntil(db: Db, until: Date): void {
  const active = db.select().from(schema.checkIns).all().filter(c => c.status === "ACTIVE");
  for (const stay of active) {
    const monitor = db.select().from(schema.checkInMonitors).all().find(m => m.checkInId === stay.id);
    const room = db.select().from(schema.rooms).all().find(r => r.id === stay.roomId);
    if (!monitor || !room) continue;
    const end = Math.min(+until, +stay.expiresAt);
    for (let ms = +monitor.lastSampleAt + 3 * 60_000; ms < end; ms += 3 * 60_000) {
      const now = new Date(ms);
      db.transaction(tx => sampleStudyPresence(tx, stay.id, room, { latitude: room.latitude, longitude: room.longitude, accuracy: 5, capturedAt: now.toISOString(), sentAt: now.toISOString() }, now));
    }
  }
}

/** A `NotificationService` wired against a real db but with no VAPID keys configured, so its push
 *  side no-ops — good enough for tests that only need `RoomRealtimeGateway` to compile. */
export function buildNotificationService(db: Db, scheduler: ManualScheduler = new ManualScheduler()): NotificationService {
  return new NotificationService(db, new PushService(db), new RoomStateService(db), scheduler);
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
  const gateway = new RoomRealtimeGateway(new RecordingHub(), roomState, notifications, null);
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
 * Runs `fn` and returns how many statements `db` executed meanwhile (the db must come from
 * `freshDb`). Transactions add no extra count: BEGIN/COMMIT are not routed through the logger.
 */
export async function countQueries<T>(db: Db, fn: () => Promise<T> | T): Promise<{ result: T; queries: number }> {
  const counter = counters.get(db);
  if (!counter) throw new Error("countQueries needs a db created by freshDb()");
  const before = counter.n;
  const result = await fn();
  return { result, queries: counter.n - before };
}
