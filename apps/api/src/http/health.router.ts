import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { ApiException } from "../common/api-error.js";
import type { AppEnv } from "./context.js";

export const healthRouter = new Hono<AppEnv>();

/** Liveness: the worker is up. Never touches the database. */
healthRouter.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

/** Tables migration 0003 creates; `proTables` below shows whether that best-effort boot migration ran. */
const PRO_TABLES = [
  "favorite_seats",
  "group_focus_timers",
  "group_seat_share_optouts",
  "room_occupancy_forecast",
  "seat_watches",
  "streak_freezes",
  "study_goals",
  "user_exams",
];

/**
 * Readiness: the database answers, else 503. (The SQLite handle is synchronous, so there is no hang to time out.)
 * Also reports how many of the Pro tables exist. Read-only: one `sqlite_master` lookup.
 */
healthRouter.get("/health/ready", (c) => {
  try {
    const rows = c.var.services.db.all<{ n: number }>(
      sql`select count(*) as n from sqlite_master where type = 'table' and name in (${sql.join(
        PRO_TABLES.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    );
    return c.json({ ok: true, proTables: `${rows[0]?.n ?? 0}/${PRO_TABLES.length}` });
  } catch (err) {
    console.error(JSON.stringify({ evt: "not_ready", msg: err instanceof Error ? err.message : String(err) }));
    throw new ApiException("INTERNAL_ERROR", "No disponible.", 503);
  }
});
