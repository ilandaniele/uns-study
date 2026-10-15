import { DurableObject } from "cloudflare:workers";
import type { Db } from "@sala/database";
import { seedInitialRoom } from "@sala/database";
import { createDoDb, migrateDo } from "@sala/database/do";
import { env, initEnv } from "../env.js";
import { handleOps } from "../ops/ops-handler.js";
import { Logger } from "../platform/logger.js";
import type { WsLike } from "../realtime/do-realtime-hub.js";
import { armAlarm } from "./alarm.js";
import { buildRuntime, type Runtime } from "./runtime.js";

export interface WorkerEnv {
  APP: DurableObjectNamespace<AppDO>;
  EVIDENCE?: R2Bucket; // uns-study-report-evidence
  [secretOrVar: string]: unknown; // strings consumed by initEnv
}

const WS_PATH = "/api/v1/realtime/ws";
const OPS_PREFIX = "/api/v1/__ops/";

/** The singleton Durable Object: owns the SQLite database, the HTTP app, the hibernating sockets and the one-shot job alarm. */
export class AppDO extends DurableObject<WorkerEnv> {
  private readonly logger = new Logger(AppDO.name);
  private readonly db: Db;
  private runtime!: Runtime;

  constructor(ctx: DurableObjectState, workerEnv: WorkerEnv) {
    super(ctx, workerEnv);
    initEnv(workerEnv);
    this.db = createDoDb(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      await migrateDo(this.db);
      await seedInitialRoom(this.db);
      this.runtime = buildRuntime({ db: this.db, ctx, env: workerEnv });
      this.runtime.scheduler.ensureRecurring();
      await armAlarm(ctx.storage, this.runtime.scheduler.nextOneShotDueAt());
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === WS_PATH && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.runtime.sockets.accept(req);
    }
    if (url.pathname.startsWith(OPS_PREFIX)) {
      // Live binding first: it is what the current version was deployed with.
      const live = this.env.OPS_IMPORT_TOKEN;
      const res = await handleOps(req, this.db, { opsImportToken: typeof live === "string" ? live : env.opsImportToken });
      if (res) return res;
    }
    const executionCtx = { waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p), passThroughOnException: () => {}, props: {} };
    return this.runtime.app.fetch(req, this.env, executionCtx as unknown as ExecutionContext);
  }

  async alarm(): Promise<void> {
    try {
      await this.runtime.scheduler.runDue();
    } finally {
      await armAlarm(this.ctx.storage, this.runtime.scheduler.nextOneShotDueAt());
    }
  }

  /** RPC from the Cron Trigger (every minute): drives the recurring jobs and is the safety net for overdue one-shots. */
  async tick(): Promise<void> {
    await this.alarm();
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    await this.runtime.sockets.onMessage(ws as unknown as WsLike, msg);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _clean: boolean): Promise<void> {
    await this.runtime.sockets.onClose(ws as unknown as WsLike);
  }

  async webSocketError(ws: WebSocket, err: unknown): Promise<void> {
    this.logger.warn("WebSocket error", err instanceof Error ? err.message : String(err));
    await this.runtime.sockets.onClose(ws as unknown as WsLike);
  }
}
