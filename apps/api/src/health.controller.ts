import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "@sala/database";
import { DB } from "./database/database.module.js";
import { ApiException } from "./common/api-error.js";

const READY_TIMEOUT_MS = 2_000;

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Liveness: the process is up. Never touches the database. */
  @Get()
  get() {
    return { ok: true, ts: new Date().toISOString() };
  }

  /** Readiness: the database answers `select 1` within 2 s, else 503. */
  @Get("ready")
  async ready() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("readiness timeout")), READY_TIMEOUT_MS);
        }),
      ]);
      return { ok: true };
    } catch (err) {
      console.error(JSON.stringify({ evt: "not_ready", msg: err instanceof Error ? err.message : String(err) }));
      throw new ApiException("INTERNAL_ERROR", "No disponible.", 503);
    } finally {
      clearTimeout(timer);
    }
  }
}
