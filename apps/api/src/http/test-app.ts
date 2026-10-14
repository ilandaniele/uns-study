// Test helper: the full Hono app over a fresh in-memory SQLite database, a recording realtime hub and a
// manual scheduler. Drive it with `app.request(path, init)`; only imported from tests.
import type { Db } from "@sala/database";
import { buildAuth } from "../auth/auth.instance.js";
import { buildServices } from "../container.js";
import { FixedClock } from "../platform/clock.js";
import { ManualScheduler } from "../platform/scheduler.js";
import { RecordingHub } from "../realtime/realtime-hub.js";
import { freshDb } from "../test-utils.js";
import { createApp } from "./app.js";

export const TEST_ORIGIN = "http://localhost:3000";

export function buildTestApp(db: Db = freshDb()) {
  const hub = new RecordingHub();
  const scheduler = new ManualScheduler();
  const services = buildServices({ db, hub, scheduler, evidence: null, clock: new FixedClock(new Date()) });
  const auth = buildAuth(db);
  const app = createApp({ services, auth });
  return { app, db, hub, scheduler, services, auth };
}

/** Headers every browser-like test request carries (trusted origin, a client IP). */
export function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { origin: TEST_ORIGIN, "cf-connecting-ip": "127.0.0.1", ...extra };
}
