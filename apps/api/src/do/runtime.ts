import type { Hono } from "hono";
import type { Db } from "@sala/database";
import { buildAuth, type Auth } from "../auth/auth.instance.js";
import { buildServices } from "../container.js";
import { env } from "../env.js";
import { createApp } from "../http/app.js";
import type { AppEnv } from "../http/context.js";
import { registerJobs } from "../jobs/register-jobs.js";
import { systemClock } from "../platform/clock.js";
import { SqliteScheduler } from "../platform/scheduler.js";
import { DoRealtimeHub } from "../realtime/do-realtime-hub.js";
import { RealtimeSockets } from "../realtime/ws-server.js";
import type { Services } from "../services.js";
import { rearmInBackground } from "./alarm.js";
import type { WorkerEnv } from "./app-do.js";

export interface Runtime {
  services: Services;
  auth: Auth;
  app: Hono<AppEnv>;
  sockets: RealtimeSockets;
  scheduler: SqliteScheduler;
}

/** Wires the whole service graph over one Durable Object: scheduler, hub, services, auth, HTTP app and sockets. */
export function buildRuntime(input: { db: Db; ctx: DurableObjectState; env: WorkerEnv }): Runtime {
  const { db, ctx } = input;
  const clock = systemClock;
  const scheduler = new SqliteScheduler(db, clock, (next) => rearmInBackground(ctx.storage, next));
  const hub = new DoRealtimeHub(ctx);
  const evidence = input.env.EVIDENCE ?? null;

  const services = buildServices({ db, hub, scheduler, evidence, clock });
  const auth = buildAuth(db);
  const app = createApp({ services, auth });
  const sockets = new RealtimeSockets({ state: ctx, db, auth, restrictions: services.restriction, webOrigins: env.webOrigins });

  registerJobs(scheduler, services, sockets);
  return { services, auth, app, sockets, scheduler };
}
