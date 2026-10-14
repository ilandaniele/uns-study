import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { ApiException } from "../common/api-error.js";
import type { AppEnv } from "./context.js";

export const healthRouter = new Hono<AppEnv>();

/** Liveness: the worker is up. Never touches the database. */
healthRouter.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

/** Readiness: the database answers `select 1`, else 503. (The SQLite handle is synchronous, so there is no hang to time out.) */
healthRouter.get("/health/ready", (c) => {
  try {
    c.var.services.db.run(sql`select 1`);
    return c.json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ evt: "not_ready", msg: err instanceof Error ? err.message : String(err) }));
    throw new ApiException("INTERNAL_ERROR", "No disponible.", 503);
  }
});
