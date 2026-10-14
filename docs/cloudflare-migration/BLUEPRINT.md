# Cloudflare migration blueprint (Fly.io to Workers + Durable Object SQLite)

Status: approved design, ready for builders. Branch: `cf/migration`.
Source decisions: `docs/relevamiento-cloudflare.md` (option D), plus the decisions recorded in section 0.
Builders: read section 0, your work item, and every contract your item touches.

---

## 0. Ground rules (apply to every work item)

### 0.1 Fixed design (do not re-litigate)

- **Web:** Next.js 16 on Workers via `@opennextjs/cloudflare@1.20.11`, `wrangler@4.151.0`, `nodejs_compat`. Worker name `uns-web`.
- **API:** one Worker `uns-api` (Hono `4.13.13`). The Worker forwards every request to one singleton Durable Object `AppDO` (`idFromName("app")`).
  - The full Hono app runs inside `AppDO`.
  - All data lives in DO SQLite through `drizzle-orm/durable-sqlite` (`drizzle-orm@0.45.4`).
- **Routing:** zone route `saladeestudio.com.ar/api/*` goes to `uns-api`; everything else goes to `uns-web`. Next rewrites to the API stay for local dev only (env-gated).
- **Realtime:** WebSocket Hibernation API inside `AppDO`. The `socket.io` and `socket.io-client` packages are removed. Socket event names are unchanged (`SocketEvents` in `@sala/contracts`).
- **Jobs:** a persisted `scheduled_jobs` table multiplexes the single DO alarm. A Cron Trigger (`* * * * *`) pings the DO as a safety net.
- **Concurrency:** every read-decide-write runs inside one synchronous `db.transaction((tx) => …)`. Advisory locks, `FOR UPDATE` and `SKIP LOCKED` are removed.
- **Tests:** Node vitest on `better-sqlite3@13.0.3` through `drizzle-orm/better-sqlite3` (sync). PGlite is removed.
- **Cost target:** Workers Paid plan, USD 5/month.

### 0.2 Ownership rules

1. A file has exactly one owner per wave. A file can change owner between waves (listed explicitly).
2. Tests live next to the code and belong to the owner of the directory.
3. `pnpm-lock.yaml` belongs to the orchestrator. Builders may run `pnpm install` locally. At each wave merge, the orchestrator runs `pnpm install` at the root and commits the regenerated lockfile.
4. NestJS, `pg`, `ioredis` and the other legacy dependencies stay installed until W4-B removes them. Files not yet ported must keep importing correctly while other items work.
5. **Shim rule:** when a shared file moves, the old path stays as a one-line re-export shim until the last wave that still needs it. The owner listed in that wave deletes it.
6. Do not open `.env`, `.env.local`, `.dev.vars` or any credential file. Templates (`*.example`) are allowed.
7. Behavior is the spec. Keep every error code, message, status code, path, payload and business rule (CLAUDE.md) identical, unless this blueprint says otherwise.

### 0.3 Typecheck and test gates

These gates let parallel builders work against a tree that is only partly ported.

| Gate | Condition |
|---|---|
| End of Wave 1 | Database package fully green. W1-B and W1-C targeted tests green. |
| End of Wave 2 | `pnpm --filter @sala/api exec vitest run` green, except `src/security/*.http.test.ts` (moved to W3-A). `tsc` errors are allowed only in W3-A/W3-B files: `main.ts`, `app.module.ts`, `database/database.module.ts`, `auth/**`, `jobs/**`, `health.controller.ts`, `auth-providers.controller.ts`, and the legacy `common/*.middleware.ts`, `common/*.pipe.ts`, `common/api-exception.filter.ts`. |
| End of Wave 3 | `pnpm --filter @sala/api typecheck && pnpm --filter @sala/api test` fully green. `wrangler deploy --dry-run` succeeds. |
| End of Wave 4 | Repo-wide `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green. Banned-terms grep is clean. |

**Per-item check script.** W1-B delivers `apps/api/scripts/check-port.mjs`. Every Wave 2 and Wave 3 builder runs `node apps/api/scripts/check-port.mjs <owned dirs…>`. It exits 1 when an owned file contains any banned pattern from appendix A.2.

---

## 1. Final directory layout

### 1.1 New or rewritten (final state)

```
apps/api/
  wrangler.jsonc                       W3-B  Worker + DO + cron + R2 + routes
  .dev.vars.example                    W1-B  variable names only, no values
  package.json                         W1-B (wave 1), W4-B (wave 4 cleanup)
  tsconfig.json                        W1-B
  vitest.config.ts                     W1-B
  scripts/check-port.mjs               W1-B
  scripts/smoke.mjs                    W3-B  smoke test against wrangler dev or a deployed URL
  src/worker.ts                        W3-B  thin Worker: fetch to DO, scheduled to DO.tick()
  src/do/app-do.ts                     W3-B  AppDO class
  src/do/runtime.ts                    W3-B  buildRuntime(): services + app + sockets + scheduler
  src/ops/ops-handler.ts               W3-B  token-gated import/export for the data migration
  src/env.ts                           W1-B  rewritten: loadEnv/initEnv, no dotenv/fs
  src/services.ts                      W1-B  `Services` interface (type registry)
  src/container.ts                     W3-A  buildServices(deps): Services
  src/platform/clock.ts                W1-B
  src/platform/logger.ts               W1-B  drop-in for the Nest Logger
  src/platform/scheduler.ts            W1-B  Scheduler, SqliteScheduler, ManualScheduler
  src/common/api-error.ts              W1-B  ApiException without Nest + toErrorResponse
  src/common/sqlite-errors.ts          W1-B
  src/common/background.ts             W1-B  same API, platform Logger type
  src/common/chunk.ts                  W1-B  re-exports chunk helpers from @sala/database
  src/http/context.ts                  W1-B  AppEnv, RequestUser
  src/http/guards.ts                   W1-B  requireAuth/optionalAuth/requireAdmin/requireAdminOnly
  src/http/validate.ts                 W1-B  zBody, zQuery, uuidParam
  src/http/reply.ts                    W1-B  Nest-compatible response helper
  src/http/app.ts                      W3-A  createApp(deps)
  src/http/middleware/*.ts             W3-A  csrf, auth-rate-limit, global-ip-rate-limit,
                                             security-headers, body-limits, slow-log, maintenance
  src/http/health.router.ts            W3-A
  src/http/auth-providers.router.ts    W3-A
  src/http/e2e-test-hooks.router.ts    W3-A
  src/auth/auth.instance.ts            W3-A  sqlite adapter, cf-connecting-ip
  src/auth/me.router.ts                W3-A
  src/realtime/realtime-hub.ts         W1-C  RealtimeHub interface + RecordingHub (tests)
  src/realtime/do-realtime-hub.ts      W1-C  hub over DurableObjectState
  src/realtime/ws-server.ts            W1-C  RealtimeSockets: accept/onMessage/onClose/sweep
  src/realtime/ws-protocol.ts          W1-C  wire types + encode/decode (shared with web by copy)
  src/realtime/room-realtime.gateway.ts W1-C rewritten class, same public methods
  src/realtime/realtime-token.router.ts W1-C
  src/realtime/socket-token.ts         W1-C  kept
  src/realtime/socket-bucket.ts        W1-C  kept, attachment-serializable
  src/jobs/*.job.ts                    W3-B  ported jobs (no Nest decorators)
  src/jobs/register-jobs.ts            W3-B
  src/<module>/<name>.router.ts        Wave 2 owners (one per former controller, section 2.9)
  src/verification/locator/*           W2-F  folded-in verifier (gemini/claude locators)
  src/verification/locator/plan-image.ts W2-F generated base64 of plano.webp
  src/verification/in-process-seat-photo-verifier.ts W2-F
packages/database/
  drizzle.config.ts                    W1-A  dialect sqlite, driver durable-sqlite
  migrations/0000_*.sql + meta/ + migrations.js   W1-A  fresh SQLite baseline
  src/schema/*.ts                      W1-A  sqlite-core port, same table/column names
  src/schema/scheduled-jobs.ts         W1-A  new
  src/client.ts                        W1-A  Db, Tx types; chunk helpers
  src/do.ts                            W1-A  createDoDb, migrateDo (export "@sala/database/do")
  src/testing.ts                       W1-A  createTestDb, migrateTestDb, buildTemplate
                                             (export "@sala/database/testing")
  src/seed.ts                          W1-A  idempotent, chunked
apps/web/
  wrangler.jsonc                       W4-A
  open-next.config.ts                  W4-A
  cloudflare-env.d.ts                  W4-A  (wrangler types output)
  src/lib/socket.ts                    W1-C  WebSocket facade, same exports
  src/lib/realtime-protocol.ts         W1-C  copy of ws-protocol types (web side)
  src/lib/__tests__/socket.test.ts     W1-C
ops/
  set-worker-secret.ps1                W4-B  clipboard to `wrangler secret put` (no echo)
  copy-app-secrets.ps1                 W4-B  Fly PG app_secrets to Worker secrets (no echo)
  export-fly-pg.ps1                    W4-B  NDJSON export per table via fly proxy + psql
  import-to-do.mjs                     W4-B  NDJSON to /api/v1/__ops/import in FK order
  backup-do.ps1                        W4-B  NDJSON download through /api/v1/__ops/export
.github/workflows/deploy.yml           W4-B  ci, then api (wrangler), then web (opennext), then smoke
.github/workflows/ci.yml               W4-B
.github/workflows/load-tests.yml       W4-C
```

### 1.2 Deleted

| Owner | Files |
|---|---|
| W1-A | `packages/database/migrations/**` (pg history), `src/migrate.ts`, `src/assert-migrations.ts` + test, `src/schema/app-secrets.ts`. Delete the `socket_io_attachments`-style bigserial table in `src/schema/rate-limit.ts` (keep `rate_limit_hits`). Rewrite `src/paths.ts` (keep only if still used). |
| W1-B | `apps/api/tsup.config.ts` (if present), `src/common/cache/cache.module.ts`. |
| W1-C | `src/realtime/realtime.module.ts`, `postgres-adapter.ts` (+ tests), `realtime-token.controller.ts`. |
| Wave 2 owners | Every `*.module.ts` and `*.controller.ts` in their directories. Each controller is replaced by a `*.router.ts`. |
| W2-C | `src/users/admin.guard.ts` |
| W2-E | `src/security/*` Upstash/ioredis code paths |
| W2-F | `apps/verifier/**` (whole app) |
| W3-A | `src/main.ts`, `src/app.module.ts`, `src/database/**`, `src/secrets.ts` + test, `src/health.controller.ts`, `src/auth-providers.controller.ts`, `src/auth/{auth.module,auth.guard,auth.tokens,allow-restricted.decorator,current-user.decorator,me.controller,request-user}.ts`, `src/common/{api-exception.filter,csrf.middleware,auth-rate-limit.middleware,global-ip-rate-limit.middleware,proxy-trust.middleware,zod-body.pipe,uuid-param.pipe,pg-errors}.ts` (+ tests; ported tests move to `src/http/**`), `src/jobs/e2e-test-hooks.controller.ts`. |
| W3-B | `src/jobs/jobs.module.ts` |
| W4-B | `fly.toml`, `fly.web.toml`, `fly.verifier.toml`, `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.verifier`, all `*.dockerignore` / `.dockerignore`, `ops/migrate-fly-db.sh`, `ops/migrate-fly-db.ps1`, `ops/backup-fly-db.ps1`, `ops/restore-fly-db.ps1`, `ops/schedule-fly-db-backup.ps1`, `ops/rotate-proxy-secret.ps1`, `ops/set-secret-from-clipboard.ps1`, `ops/setup-verifier-secrets.ps1`, `ops/sala-app-grants.sql`. |

---

## 2. Shared contracts

Every builder codes against these. Names, signatures and paths are binding.

### 2.1 Database package (`@sala/database`, owner W1-A)

```ts
// packages/database/src/client.ts  (re-exported from "@sala/database")
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema/index.js";
export type Schema = typeof schema;
export type Db = BaseSQLiteDatabase<"sync", any, Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export const SQLITE_MAX_PARAMS = 100;
export function chunk<T>(items: readonly T[], size: number): T[][];
/** Max rows per multi-row INSERT for a table with `columnCount` bound columns (>= 1). */
export function rowsPerInsert(columnCount: number): number; // Math.max(1, Math.floor(100 / columnCount))
/** Runs `fn` per chunk of at most `size` values (default 90) and concatenates results. For inArray. */
export function inChunks<T, R>(values: readonly T[], fn: (part: T[]) => R[], size?: number): R[];

// "@sala/database" (index.ts) exports:
//   schema, Db, Tx, Schema, SQLITE_MAX_PARAMS, chunk, rowsPerInsert, inChunks,
//   seedInitialRoom, INITIAL_ROOM, INITIAL_CHAT_ROOM,
//   generateRoomLayout, ROOM_VIEWBOX, layout types
// Removed: createDb, closeDb, needsSsl, migrate, assertMigrationsApplied.

// packages/database/src/do.ts  -> "@sala/database/do"  (Workers only; imports migrations.js)
export function createDoDb(storage: DurableObjectStorage): Db;
export function migrateDo(db: Db): Promise<void>; // drizzle-orm/durable-sqlite/migrator

// packages/database/src/testing.ts -> "@sala/database/testing"  (Node only)
export interface TestDbOptions { template?: Buffer; logger?: { logQuery(query: string, params: unknown[]): void } }
export function createTestDb(opts?: TestDbOptions): Db; // better-sqlite3, PRAGMA foreign_keys=ON
export function migrateTestDb(db: Db): void;            // drizzle-orm/better-sqlite3/migrator, same folder
export function buildTemplate(): Promise<Buffer>;       // migrate + seedInitialRoom, then serialize()

// packages/database/src/seed.ts
export function seedInitialRoom(db: Db): Promise<void>; // idempotent, chunked; never overwrites lat/lng
```

**Schema port rules (W1-A).** Every other builder relies on these.

- **Names.** Table and column SQL names stay identical to the pg schema. Exported TS names stay identical too. The data import (2.12) depends on this.
- **Types:**

  | pg type | SQLite port |
  |---|---|
  | `timestamp` | `integer(name, { mode: "timestamp_ms" })`. JS type stays `Date`. |
  | `defaultNow()` | `.$defaultFn(() => new Date())` |
  | `uuid().defaultRandom()` | `text().$defaultFn(() => crypto.randomUUID())` |
  | `boolean` | `integer(name, { mode: "boolean" })` |
  | `jsonb` | `text(name, { mode: "json" }).$type<…>()` |
  | `real` / `doublePrecision` | `real` |
  | `bigserial` | `integer().primaryKey({ autoIncrement: true })` |
  | `bytea` | `customType<{ data: Buffer; driverData: Buffer \| Uint8Array \| ArrayBuffer }>` with `mapFromDriverValue: v => Buffer.from(v as any)`, SQL type `blob` |
  | `date` | `text` holding `YYYY-MM-DD`. Keep the JS type the pg column produced. |

- **Enums.** Each `pgEnum` export `xEnum` becomes `export const xEnum = { enumValues: [...] as const }`. Columns use `text(name, { enum: xEnum.enumValues })`. Code that reads `xEnum.enumValues` keeps working.
- **Indexes.** Partial unique indexes keep the same names and the same `WHERE`. Boolean predicates become `= 1`, e.g. `where seat_freed = 1`.
- **Case-folded columns.** `lower(...)` expression indexes are replaced by explicit columns filled in JS with `value.toLowerCase()`:
  - `user_profiles.alias_lower` (nullable, like `alias`), unique index `user_profiles_alias_lower_unique`.
  - `retired_aliases.alias_lower`, unique index `retired_aliases_alias_lower_unique`.
  - `table_name_proposals.name_lower`, partial unique `(table_id, name_lower) WHERE status = 'ACTIVE'`, same index name as today.
- **Check constraints** are kept (SQLite supports them).
- **Dropped:** `app_secrets` and the socket.io adapter table.
- **New table:**

  ```ts
  export const scheduledJobs = sqliteTable("scheduled_jobs", {
    key: text("key").primaryKey(),                 // "expiration", "summary:<roomId>", "admin-present:<userId>"
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    intervalMs: integer("interval_ms"),            // null = one-shot
    payload: text("payload", { mode: "json" }),    // unknown JSON or null
  }, (t) => [index("idx_scheduled_jobs_due_at").on(t.dueAt)]);
  ```

- **Seed.** `INITIAL_ROOM` (`principal`, 108 seats) and `INITIAL_CHAT_ROOM` (`sala-principal`) stay unchanged. Multi-row inserts are chunked with `rowsPerInsert`.

### 2.2 Environment (`apps/api/src/env.ts`, owner W1-B)

```ts
export interface Env { /* same fields as today, minus the removed ones; plus: */
  r2Binding: boolean;          // true when the EVIDENCE binding exists (set by initEnv)
  geminiApiKey: string; anthropicApiKey: string; verifierModel: string;
  opsImportToken: string;      // "" disables /api/v1/__ops/*
  maintenanceMode: boolean;    // MAINTENANCE_MODE === "1"
}
export function loadEnv(src: Record<string, string | undefined>): Env; // pure
export const env: Env;                                  // mutable singleton = loadEnv(process.env)
export function initEnv(bindings: Record<string, unknown>): void;
// copies string bindings into process.env, then Object.assign(env, loadEnv(process.env))
```

- **Removed fields:** `databaseUrl`, `pgliteDir`, `dbAutoMigrate`, `upstash*`, `redisUrl`, `realtimeAdapter`, `trustProxyHops`, `proxySharedSecret`.
- **Unchanged fields:** all others, with the same defaults (`presenceMaxAgeS` 120, `presenceMaxAccuracyM` 150, `seatVerifierMinConfidence` 0.8, `subscriptionPriceArs` 1500, `e2eTestHooks` forced off in production).
- **Binding names.** Secrets and vars keep their current env-var names (`BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, …).
- **Startup.** `initEnv(env)` is called first thing in the `AppDO` constructor.

### 2.3 Worker bindings and wrangler config

```ts
// apps/api/src/do/app-do.ts (W3-B)
export interface WorkerEnv {
  APP: DurableObjectNamespace<AppDO>;
  EVIDENCE?: R2Bucket;                        // uns-study-report-evidence
  [secretOrVar: string]: unknown;             // strings consumed by initEnv
}
```

`apps/api/wrangler.jsonc` (W3-B):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "uns-api",
  "main": "src/worker.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "routes": [{ "pattern": "saladeestudio.com.ar/api/*", "zone_name": "saladeestudio.com.ar" }],
  "durable_objects": { "bindings": [{ "name": "APP", "class_name": "AppDO" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AppDO"] }],
  "triggers": { "crons": ["* * * * *"] },
  "r2_buckets": [{ "binding": "EVIDENCE", "bucket_name": "uns-study-report-evidence" }],
  "rules": [{ "type": "Text", "globs": ["**/*.sql"], "fallthrough": true }],
  "observability": { "enabled": true },
  "vars": {
    "NODE_ENV": "production",
    "WEB_ORIGINS": "https://saladeestudio.com.ar",
    "BETTER_AUTH_URL": "https://saladeestudio.com.ar",
    "PUBLIC_WEB_URL": "https://saladeestudio.com.ar",
    "R2_BUCKET": "uns-study-report-evidence",
    "SEAT_VERIFIER_MODE": "enforce",
    "MAINTENANCE_MODE": "0"
    // plus every non-secret var that exists today (EMAIL_FROM, VAPID_PUBLIC_KEY, VAPID_SUBJECT,
    // ADMIN_EMAILS, OWNER_EMAIL, R2_ACCOUNT_ID, SUBSCRIPTION_PRICE_ARS, ...). W3-B copies the
    // names from env.ts. Values come from the current fly.toml [env] section, never from .env files.
  }
}
```

**Assumption to verify.** Keep `SEAT_VERIFIER_MODE` at whatever value `fly.toml` sets today. `enforce` above is only a placeholder.

**Worker secrets** (`wrangler secret put`, never in config): `BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY`, `SEAT_VERIFIER_TOKEN` (only if the HTTP verifier stays), `OPS_IMPORT_TOKEN`.

`apps/web/wrangler.jsonc` (W4-A):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "uns-web",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "workers_dev": true,
  "routes": [
    { "pattern": "saladeestudio.com.ar/*", "zone_name": "saladeestudio.com.ar" },
    { "pattern": "www.saladeestudio.com.ar/*", "zone_name": "saladeestudio.com.ar" }
  ],
  "observability": { "enabled": true }
}
```

**Routing precedence.** `saladeestudio.com.ar/api/*` is more specific than `saladeestudio.com.ar/*`, so Cloudflare sends `/api/*` to `uns-api`.

### 2.4 Worker entry and AppDO (owner W3-B)

```ts
// src/worker.ts
export { AppDO } from "./do/app-do.js";
export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> { return appStub(env).fetch(req); },
  async scheduled(_c: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) { ctx.waitUntil(appStub(env).tick()); },
} satisfies ExportedHandler<WorkerEnv>;
function appStub(env: WorkerEnv) { return env.APP.get(env.APP.idFromName("app"), { locationHint: "sam" }); }

// src/do/app-do.ts
export class AppDO extends DurableObject<WorkerEnv> {
  // constructor: initEnv(env); db = createDoDb(ctx.storage);
  //   ctx.blockConcurrencyWhile(async () => { await migrateDo(db); await seedInitialRoom(db);
  //     runtime = buildRuntime({ db, ctx, env }); runtime.scheduler.ensureRecurring(); await armAlarm(); })
  //   ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  fetch(req: Request): Promise<Response>;
  //   1. path === "/api/v1/realtime/ws" && Upgrade: websocket -> runtime.sockets.accept(req)
  //   2. path starts with "/api/v1/__ops/"                  -> handleOps(req, db, env)
  //   3. otherwise                                          -> runtime.app.fetch(req)
  alarm(): Promise<void>;          // runtime.scheduler.runDue(); re-arm with nextDueAt()
  tick(): Promise<void>;           // RPC from cron: if no alarm set or alarm overdue -> alarm()
  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void>; // runtime.sockets.onMessage
  webSocketClose(ws: WebSocket, code: number, reason: string, clean: boolean): Promise<void>; // onClose
  webSocketError(ws: WebSocket, err: unknown): Promise<void>; // onClose
}

// src/do/runtime.ts
export interface Runtime { services: Services; auth: Auth; app: Hono<AppEnv>; sockets: RealtimeSockets; scheduler: SqliteScheduler }
export function buildRuntime(input: { db: Db; ctx: DurableObjectState; env: WorkerEnv }): Runtime;
```

### 2.5 Clock, logger, background (owner W1-B)

```ts
// src/platform/clock.ts
export interface Clock { now(): Date }
export const systemClock: Clock;
export class FixedClock implements Clock { constructor(t: Date); now(): Date; set(t: Date): void; advance(ms: number): void }

// src/platform/logger.ts  - drop-in for `import { Logger } from "@nestjs/common"`
export class Logger {
  constructor(context?: string);
  log(msg: unknown, ...rest: unknown[]): void; warn(...): void; error(...): void; debug(...): void; verbose(...): void;
}  // emits one JSON line per call: {lvl, ctx, msg, ...}

// src/common/background.ts - same exports and semantics as today
export function runInBackground(logger: Logger, label: string, task: () => Promise<unknown>): void;
export function flushBackground(): Promise<void>;
export function allInOrder<T extends readonly unknown[]>(...p): Promise<T>;
```

Services keep calling `new Date()`. The Clock is only for the scheduler and jobs. Jobs keep their `runSweep(now)` / `tick()` signatures.

### 2.6 Scheduler (owner W1-B; table from W1-A)

```ts
// src/platform/scheduler.ts
export type JobHandler = (ctx: { key: string; payload: unknown; now: Date }) => Promise<void> | void;
export interface Scheduler {
  /** One-shot. Replaces any job with the same key (due time and payload). */
  schedule(key: string, dueAt: Date, payload?: unknown): void;
  /** One-shot. No-op when a job with that key already exists. Returns true when it inserted. */
  scheduleIfAbsent(key: string, dueAt: Date, payload?: unknown): boolean;
  /** Recurring. Inserts if missing (first run at firstDueAt ?? now + intervalMs); otherwise only updates interval. */
  every(key: string, intervalMs: number, firstDueAt?: Date): void;
  cancel(key: string): void;
  has(key: string): boolean;
}
export class SqliteScheduler implements Scheduler {
  constructor(db: Db, clock: Clock, onNextDueChanged: (next: Date | null) => void);
  /** Handler lookup: exact key first, then the prefix before the first ':'. */
  register(keyOrPrefix: string, handler: JobHandler): void;
  /** Runs every job with due_at <= now, sequentially. For each job it first advances due_at
   *  (recurring) or deletes the row (one-shot), then runs the handler. Errors are logged, not
   *  rethrown. Re-entrant calls while running return immediately (in-memory flag). */
  runDue(now?: Date): Promise<{ ran: string[] }>;
  nextDueAt(): Date | null;
  ensureRecurring(): void; // calls every() for the table below; idempotent
}
export class ManualScheduler implements Scheduler { /* in-memory; tests call runDue(now) */ }
```

Recurring jobs registered by `ensureRecurring()` (handlers registered by W3-B in `src/jobs/register-jobs.ts`):

| key | interval | handler |
|---|---|---|
| `daily-reset` | 60 000 ms | `DailyResetJob.tick()` (fires the reset at 04:00 America/Argentina/Buenos_Aires per room) |
| `expiration` | 30 000 ms | `ExpirationJob.tick()` |
| `checkin-expiry-reminder` | 60 000 ms | `CheckInExpiryReminderJob.tick()` |
| `dispute-resolution` | 15 000 ms | `DisputeResolutionJob.tick()` |
| `attachment-sweep` | 3 600 000 ms | `AttachmentSweepJob.tick()` |
| `email-send` | 30 000 ms | `EmailSendJob.tick()` |
| `realtime-session-sweep` | 60 000 ms | `RealtimeSockets.sweepSessions()` |

One-shot prefixes:

| prefix | scheduled by | handler |
|---|---|---|
| `summary:<roomId>` | `RoomRealtimeGateway` (W1-C) via `scheduleIfAbsent`, delay `max(0, 250 - sinceLastFlush)` | `gateway.flushRoom(roomId)` |
| `admin-present:<adminUserId>` | `NotificationService.scheduleAdminPresent` (W2-E) via `schedule`, delay `randomInt(2, 5 min)`, payload `{ roomId, adminUserId }` | `notifications.fireAdminPresent(roomId, adminUserId, () => gateway.emitAdminPresent(roomId, {}))` |

### 2.7 Realtime (owner W1-C)

**Server-side hub.**

```ts
// src/realtime/realtime-hub.ts
export interface RealtimeHub {
  publishToRoom(roomId: string, event: string, payload: unknown): void;
  publishToChat(chatRoomId: string, event: string, payload: unknown): void;
  publishToUser(userId: string, event: string, payload: unknown): void;
  broadcast(event: string, payload: unknown): void;
  disconnectUser(userId: string, code?: number, reason?: string): void; // default 4001 "session-ended"
}
export class RecordingHub implements RealtimeHub { readonly sent: Array<{ to: string; event: string; payload: unknown }>; /* + disconnects */ }
```

**Gateway.** Same public method names and payloads as today.

```ts
// src/realtime/room-realtime.gateway.ts
export class RoomRealtimeGateway {
  constructor(
    hub: RealtimeHub,
    roomState: Pick<RoomStateService, "getRoomSummary">,
    notifications: Pick<NotificationService, "handleSeatFreed">,
    scheduler: Scheduler | null, // null = setTimeout fallback (unit tests)
  );
  broadcastSeatChanges(roomId: string, changes: SeatStateChange[]): Promise<void>;
  flushRoom(roomId: string): Promise<void>;     // now public (scheduler handler)
  flushPending(): Promise<void>;
  emitAdminPresent(roomId: string, payload: RoomAdminPresentEvent): void;
  emitDailyReset(roomId: string): void;
  emitChatMessage(...same as today): void; emitChatDeleted(...): void;
  emitDm(...): void; emitGroupMessage(...): void; emitGroupUpdated(...): void;
  emitDisputeOpened(...): void; emitDisputeUpdated(...): void; emitDisputeResolved(...): void;
  emitDisputeChallenge(...): void; emitDisputeWon(...): void;
  emitCheckInExpiring(...): void; emitTableNicknameChanged(...): void;
  disconnectUser(userId: string): void;
}
```

- **Gateway behavior.** Pending seat changes are kept in an in-memory `Map<roomId, SeatStateChange[]>`. The `summary:<roomId>` job only triggers `flushRoom`. If the DO restarted in between, the flush is a no-op. This is accepted (see risk R9).
- **Exported helper.** `resolveSocketUserId(...)` stays exported. Its signature is adapted: it takes `(token: string | null, cookieHeader: string | null, deps)` instead of a Socket.IO handshake.

**Socket server inside the DO.**

```ts
// src/realtime/ws-server.ts
export interface SocketAttachment {
  ip: string; userId: string | null; sessionId: string | null;
  rooms: string[]; chats: string[];               // max 5 rooms (MAX_JOINED_ROOMS_PER_SOCKET)
  bucket: { tokens: number; refilledAt: number }; // 10 events / 10 s (SOCKET_EVENT_LIMIT)
}
export class RealtimeSockets {
  constructor(deps: {
    state: Pick<DurableObjectState, "acceptWebSocket" | "getWebSockets">;
    db: Db; auth: Pick<Auth, "api">;
    restrictions: Pick<RestrictionService, "assertNot">; // or the existing blocked check
    webOrigins: string[];
  });
  accept(req: Request): Promise<Response>;   // 101 with client socket, 403 bad Origin, 429 > 20 per IP
  onMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void>;
  onClose(ws: WebSocket): Promise<void>;
  sweepSessions(): Promise<void>;           // closes 4001 when the session is gone
}
```

`DoRealtimeHub(state)` implements `RealtimeHub`:

- `user:<id>` and `ip:<ip>` are WebSocket tags, set at accept. Tags cannot change after accept.
- Room and chat membership live in the serialized attachment. `publishToRoom` and `publishToChat` filter `state.getWebSockets()` by attachment.
- `publishToUser` uses `getWebSockets("user:<id>")`.

**Wire protocol** (JSON text frames, `src/realtime/ws-protocol.ts`; the web keeps an identical copy).

```ts
// client -> server
type ClientFrame = { e: string; d?: unknown; id?: number };           // id present => ack expected
// server -> client
type ServerEvent = { e: string; d: unknown };
type ServerAck   = { ack: number; d: unknown };
// heartbeat: raw text "ping" -> "pong" (auto-response, does not wake the DO)
```

- **Endpoint:** `GET /api/v1/realtime/ws[?token=<socket token>]`, Upgrade `websocket`.
  - Identity comes from the token (`socket-token.ts` HMAC claims plus the session-active check). The same-origin better-auth cookie is the fallback. Otherwise the socket is anonymous.
  - Origin must be in `env.webOrigins`, else 403.
- **Client events** (names from `SocketEvents`):
  - `room:join` acks `{ joined: boolean }`.
  - `room:leave` has no ack.
  - `chat:join` and `chat:leave` take `{ roomId }`. `chat:join` requires a user that is not blocked.
  - Payload schema is `{ roomId: uuid }`. Invalid payloads are ignored (ack `{ joined: false }` when an id was sent).
- **Limits:**
  - Frame > 4 KB: close 1009.
  - Over the event budget: frame dropped. After 3 consecutive drops: close 4008.
  - Unknown event: ignored.
- **Close codes:** 4001 session ended or user disconnected, 4008 rate limited, 1011 server error. The client always reconnects with backoff.

**Token endpoint** (unchanged): `GET /api/v1/realtime/token` returns `{ token, expiresAt }` (auth required). File `realtime-token.router.ts` exports `realtimeTokenRouter`.

**Web facade** (`apps/web/src/lib/socket.ts`). Same exports. The consuming hooks do not change.

```ts
export interface RealtimeSocket {
  readonly connected: boolean;
  on(event: string, handler: (data: any) => void): this;     // reserved: "connect", "disconnect"(reason), "connect_error"(err)
  off(event: string, handler?: (data: any) => void): this;
  emit(event: string, data?: unknown, ack?: (res: any) => void): this; // buffered while disconnected (socket.io semantics)
  connect(): this;
  disconnect(): this;                                        // manual: no auto-reconnect until connect()
}
export type Socket = RealtimeSocket;
export function getSocket(): Socket;   // SSR: inert stub (never connects)
export function resetSocket(): void;   // clears cached token, disconnect() + connect()
export function joinChat(chatRoomId: string): void;
export function leaveChat(chatRoomId: string): void;
```

- **URL:**
  - When `NEXT_PUBLIC_SOCKET_URL` is set, use it, converting `http`/`https` to `ws`/`wss`, then append `/api/v1/realtime/ws`.
  - Otherwise use `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1/realtime/ws`.
- **Token:** fetched before every connect attempt (same 30 s cache margin and `peekMe` short-circuit as today). Sent as `?token=`.
- **Reconnect backoff:** 500 ms × 2^n, capped at 10 s, with ±30 % jitter. Reset to the base delay after the connection stays open for 30 s.
- **Heartbeat:** send `"ping"` every 25 s. If there is no `"pong"` within 10 s, close and reconnect.
- **Swap:** `AnnouncementsBanner.tsx` switches its type import to `@/lib/socket`. `socket.io-client` is removed from `apps/web/package.json`.

### 2.8 HTTP context, guards, validation, replies (owner W1-B)

```ts
// src/http/context.ts
export interface RequestUser { id: string; name: string; email: string; image: string | null; emailVerified?: boolean; sessionId?: string }
export type AppEnv = {
  Variables: {
    services: Services;
    auth: Auth;                 // import type from ../auth/auth.instance.js
    ip: string;                 // cf-connecting-ip, else "127.0.0.1"
    user: RequestUser | null;   // set by guards; null when anonymous
  };
};
export function currentUser(c: Context<AppEnv>): RequestUser; // throws ApiErrors.unauthenticated() if null

// src/http/guards.ts  (Hono middleware; same semantics as the Nest guards)
export function requireAuth(opts?: { allowRestricted?: boolean }): MiddlewareHandler<AppEnv>;
//  getSession via c.var.auth.api.getSession({ headers: c.req.raw.headers }); 401 UNAUTHENTICATED if none;
//  unless allowRestricted, SUSPENDED/BANNED -> ApiErrors.restricted() (30 s cache, cleared above 5000 entries)
export const optionalAuth: MiddlewareHandler<AppEnv>;
export const requireAdmin: MiddlewareHandler<AppEnv>;      // roles ADMIN | MODERATOR, then the restriction check
export const requireAdminOnly: MiddlewareHandler<AppEnv>;  // role ADMIN; same 403 message as today

// src/http/validate.ts
export function zBody<T extends z.ZodTypeAny>(schema: T): MiddlewareHandler<AppEnv, string, { in: { json: z.input<T> }; out: { json: z.output<T> } }>;
export function zQuery<T extends z.ZodTypeAny>(schema: T): MiddlewareHandler<...>;
export function uuidParam(...names: string[]): MiddlewareHandler<AppEnv>;
// Failures throw exactly what ZodBodyPipe / UuidParamPipe throw today (ApiErrors.validation(...)).
// A body that is not valid JSON -> same error as today's parser path (VALIDATION_ERROR 400).
// Read data with c.req.valid("json").

// src/http/reply.ts  - Nest response semantics
export function reply(c: Context, value: unknown, status?: number): Response;
// value null/undefined -> empty body with status; object/array -> JSON; status default 200
```

**Status code rule** (keeps Nest behavior):

- POST handlers return 201 unless the Nest method had `@HttpCode(n)`; then they return n.
- Every other method returns 200 unless `@HttpCode` said otherwise.
- `@Header(...)` and `res.setHeader(...)` become `c.header(...)`.
- Express `res.send(buffer)` (avatar GET) becomes `new Response(bytes, { headers })`.

**Services registry.**

```ts
// src/services.ts  - type-only registry; implementation in container.ts (W3-A)
// The value type of each key is the class exported by that file (the Wave 2 owner keeps the class name).
export interface Services {
  rooms; roomState; roomStats; roomCache; presence; checkIns; photoVerification; observations;   // W2-A
  disputes; tableNames; reputation; rankings; studySessions; study; roomPeople;                // W2-B
  chat; dm; groups; blocks; profiles; avatars; alias; roles; restriction;                       // W2-C
  adminUsers; adminReports; adminRooms; adminAudit; adminStudySessions; moderation;
  announcements; reports; qr;                                                                   // W2-D
  notifications; push; pushSubscriptions; notificationPreferences; emailCampaigns; resend;
  subscriptions; mercadoPago; rateLimit; antiAbuse; securityEvents; abusePolicy; turnstile;     // W2-E
  storage; seatPhotoVerifier /* SeatPhotoVerifier | null */;                                    // W2-F
  realtime /* RoomRealtimeGateway */;                                                           // W1-C
  scheduler /* Scheduler */; clock /* Clock */;
  jobs: { expiration; disputeResolution; dailyReset; attachmentSweep; checkInExpiryReminder; emailSend };
}
```

W1-B writes the real `import type` lines against the current class names. If a Wave 2 owner renames a class, that owner updates this file in Wave 2. This is the only shared file with that exception, and only for type imports.

### 2.9 Router mapping (Nest controller to Hono router)

**Rules for every router:**

- Each router file exports `export const <name>Router = new Hono<AppEnv>()`.
- Route paths are written in full, relative to `/api/v1`. Example: `checkinsRouter.post("/checkins", requireAuth(), zBody(createCheckInSchema), handler)`.
- Inside one router, register static segments before parameter segments. Examples: `/groups/contacts` before `/groups/:id`; `/profiles/me` before `/profiles/:userId`.
- Class-level guards become middleware on each route. Method-level guards are appended after them, e.g. `requireAdmin, requireAdminOnly`.

`createApp` mounts the routers in this order with `api.route("/", xRouter)`:

| Owner | File | Export | Routes (all under `/api/v1`) |
|---|---|---|---|
| W3-A | `http/health.router.ts` | `healthRouter` | GET `/health`, GET `/health/ready` |
| W3-A | `http/auth-providers.router.ts` | `authProvidersRouter` | GET `/auth-providers` |
| W3-A | `auth/me.router.ts` | `meRouter` | GET `/me` (optional auth) |
| W1-C | `realtime/realtime-token.router.ts` | `realtimeTokenRouter` | GET `/realtime/token` (auth) |
| W2-A | `rooms/rooms.router.ts` | `roomsRouter` | GET `/rooms`, GET `/rooms/:idOrSlug`, GET `/rooms/:idOrSlug/map` (Cache-Control no-cache, ETag) |
| W2-A | `rooms/room-stats.router.ts` | `roomStatsRouter` | POST `/rooms/:idOrSlug/visits` (204, optional auth), GET `/rooms/:idOrSlug/stats/today` |
| W2-A | `presence/presence.router.ts` | `presenceRouter` | GET `/presence/grant`, POST `/presence/validate` (auth) |
| W2-A | `checkins/checkins.router.ts` | `checkinsRouter` | POST `/checkins`, DELETE `/checkins/current` (200), POST `/checkins/current/extend`, POST `/checkins/:id/photo` (auth) |
| W2-A | `observations/observations.router.ts` | `observationsRouter` | POST `/observations` (auth) |
| W2-B | `disputes/disputes.router.ts` | `disputesRouter` | POST `/disputes`, POST `/disputes/:id/votes`, POST `/disputes/:id/respond` (auth) |
| W2-B | `disputes/disputes-read.router.ts` | `disputesReadRouter` | GET `/disputes/:id`, GET `/rooms/:idOrSlug/disputes` (optional auth) |
| W2-B | `table-names/table-names.router.ts` | `tableNamesRouter` | GET `/tables/:tableId/names` (optional), POST same (auth), POST/DELETE `/names/:proposalId/vote` (auth) |
| W2-B | `rankings/rankings.router.ts` | `rankingsRouter` | GET `/rooms/:idOrSlug/rankings` (optional auth, headers) |
| W2-B | `study/study.router.ts` | `studyRouter` | POST `/study/start`, POST `/study/stop` (200) (auth) |
| W2-B | `study/room-people.router.ts` | `roomPeopleRouter` | GET `/rooms/:idOrSlug/people`, GET `/rooms/:idOrSlug/occupants` (auth) |
| W2-C | `chat/chat.router.ts` | `chatRouter` | GET/POST `/rooms/:idOrSlug/messages`, DELETE `/messages/:id` (auth) |
| W2-C | `dm/dm.router.ts` | `dmRouter` | GET/POST `/conversations`, GET/POST `/conversations/:id/messages`, POST `/conversations/:id/read` (200) |
| W2-C | `groups/groups.router.ts` | `groupsRouter` | GET `/groups`, GET `/groups/contacts`, POST `/groups`, GET `/groups/:id`, POST `/groups/:id/members` (200), POST `/groups/:id/leave` (200), GET/POST `/groups/:id/messages`, POST `/groups/:id/read` (200) |
| W2-C | `blocks/blocks.router.ts` | `blocksRouter` | POST/DELETE(200) `/users/:userId/block`, GET `/me/blocks` |
| W2-C | `profiles/profiles.router.ts` | `profilesRouter` | GET/PATCH `/profiles/me`, GET/PATCH `/profiles/me/privacy`, GET `/profiles/:userId` |
| W2-C | `profiles/account.router.ts` | `accountRouter` | POST `/me/delete` (200, allowRestricted) |
| W2-C | `profiles/checkin-identity.router.ts` | `checkinIdentityRouter` | PATCH `/checkins/current/identity` |
| W2-C | `avatars/avatars.router.ts` | `avatarsRouter` | POST/DELETE `/profiles/me/avatar`, POST `/profiles/me/avatar/google` (auth); GET `/avatars/:userId` (optional, binary) |
| W2-D | `admin/admin-users.router.ts` | `adminUsersRouter` | `/admin/users` GET, GET `:id`, POST `:id/actions`, PUT/DELETE `:id/admin` (admin-only) |
| W2-D | `admin/admin-reports.router.ts` | `adminReportsRouter` | `/admin/reports` GET, GET `:id`, PATCH `:id`, GET `:id/attachments/:attachmentId/url` |
| W2-D | `admin/admin-rooms.router.ts` | `adminRoomsRouter` | `/admin/rooms/:idOrSlug/{live,stats,geofence}` GET, POST `geofence/test`, PUT `geofence` (admin-only), POST `mark-all-occupied`, POST `mark-all-occupied/undo` |
| W2-D | `admin/admin-audit.router.ts` | `adminAuditRouter` | GET `/admin/audit` |
| W2-D | `admin/admin-names.router.ts` | `adminNamesRouter` | DELETE `/admin/names/:proposalId`, DELETE `/admin/names/tables/:tableId/nickname` |
| W2-D | `admin/admin-announcements.router.ts` | `adminAnnouncementsRouter` | `/admin/announcements` GET, POST/PATCH `:id`/DELETE `:id` (admin-only) |
| W2-D | `admin/admin-study-sessions.router.ts` | `adminStudySessionsRouter` | POST `/admin/study-sessions` (admin-only) |
| W2-D | `announcements/announcements.router.ts` | `announcementsRouter` | GET `/rooms/:idOrSlug/announcements` |
| W2-D | `qr/qr.router.ts` | `qrRouter` | `/admin/rooms/:idOrSlug/qr` POST, GET, DELETE `:id` (200) (admin-only); GET `/qr/:token` (public) |
| W2-D | `reports/reports.router.ts` | `reportsRouter` | POST `/users/:userId/reports`, POST `/reports/:id/attachments`, POST `/reports/:id/attachments/:attachmentId/complete` |
| W2-E | `notifications/push-subscriptions.router.ts` | `pushSubscriptionsRouter` | GET `/notifications/vapid-public-key` (public); POST, POST `test`, DELETE `/notifications/push-subscriptions` (auth) |
| W2-E | `notifications/notification-preferences.router.ts` | `notificationPreferencesRouter` | GET/PUT `/notifications/preferences` |
| W2-E | `email/admin-email.router.ts` | `adminEmailRouter` | `/admin/email-campaigns` GET, GET `config`, GET `recipients/count`, POST, PATCH `:id`, POST `:id/send` |
| W2-E | `email/unsubscribe.router.ts` | `unsubscribeRouter` | GET/POST(200) `/email/unsubscribe` (POST accepts form-urlencoded, RFC 8058) |
| W2-E | `subscriptions/subscriptions.router.ts` | `subscriptionsRouter` | GET `/subscriptions/me`, POST `checkout`, POST `cancel` |
| W2-E | `subscriptions/donations.router.ts` | `donationsRouter` | POST `/donations/checkout` (200, public) |
| W2-E | `subscriptions/mercadopago-webhook.router.ts` | `mercadopagoWebhookRouter` | POST `/webhooks/mercadopago` (200, public) |
| W2-F | `verification/verification.router.ts` | `verificationRouter` | GET `/verification/status` |
| W3-A | `http/e2e-test-hooks.router.ts` | `e2eTestHooksRouter` | POST `/__e2e/expire-checkin` (200; 403 FORBIDDEN when `env.e2eTestHooks` is false) |

**Router-level rate limits.** Calls such as `checkin:{user}` 5/60 s stay inline in the handler. They call `c.var.services.rateLimit` with the same keys and limits as today.

### 2.10 Error mapping (owner W1-B; wired by W3-A)

```ts
// src/common/api-error.ts
export class ApiException extends Error {
  constructor(readonly code: ApiErrorCode, message: string, readonly status: number, readonly reason?: string, readonly details?: unknown);
  getStatus(): number;                     // compatibility with tests that call it
  getResponse(): { error: ApiErrorBody };  // compatibility
}
export const ApiErrors: { /* identical factory names, codes, messages, statuses */ };
export interface ApiErrorBody { code: ApiErrorCode; message: string; reason?: string; details?: unknown }
export function toErrorResponse(err: unknown, req: { method: string; path: string }): { status: number; body: { error: ApiErrorBody } };
```

`toErrorResponse` rules:

| Input | Output |
|---|---|
| `ApiException` | its own status and body |
| Hono `HTTPException` or any error with numeric `status` | `codeForStatus(status)`: ≥500 `INTERNAL_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 429 `RATE_LIMITED`, else `VALIDATION_ERROR`; message from the error; array messages joined with `", "` |
| Anything else | 500 `INTERNAL_ERROR`, message `"Error interno."`, and log `{evt:"unhandled_error",method,path,msg,stack}` |

Wiring (W3-A):

- `app.onError((err, c) => { const r = toErrorResponse(err, …); return c.json(r.body, r.status) })`
- `app.notFound(...)` returns 404 `NOT_FOUND` with the same body shape.

### 2.11 SQLite errors (owner W1-B)

```ts
// src/common/sqlite-errors.ts
/** True for SQLITE_CONSTRAINT_UNIQUE / "UNIQUE constraint failed" (better-sqlite3 and DO SqlStorage),
 *  following `.cause` chains (drizzle wraps driver errors). When `targets` is given, at least one
 *  must appear in the message: "table.column" for column indexes, the index name for expression indexes. */
export function isUniqueViolation(err: unknown, targets?: string[]): boolean;
export function isForeignKeyViolation(err: unknown): boolean;
export function isCheckViolation(err: unknown): boolean;
```

`common/pg-errors.ts` becomes a re-export shim until W3-A deletes it.

**Caveat.** SQLite reports the column list, not the index name, for column indexes. Callers that discriminate by constraint must pass `"check_ins.user_id"` style targets. Prefer an explicit pre-check inside the same sync transaction; the catch is only a backstop.

### 2.12 Ops import/export (owner W3-B; client script W4-B)

All endpoints take `Authorization: Bearer <OPS_IMPORT_TOKEN>`, compared with `timingSafeEqual`. When `OPS_IMPORT_TOKEN` is empty, every `/api/v1/__ops/*` path returns 404.

```
GET  /api/v1/__ops/tables
  -> 200 { tables: [{ name, count }] }          // in FK-safe insert order (from drizzle getTableConfig)

POST /api/v1/__ops/import
  body { table: string, rows: object[], mode?: "insert" | "replace" }   // max 500 rows, max 5 MB
  -> 200 { inserted: number }
  - rows are keyed by SQL column name (snake_case), as produced by pg row_to_json
  - conversion per column (drizzle metadata):
      timestamp_ms <- ISO string | number
      boolean      <- true/false
      json         <- object
      blob         <- "\\x<hex>" | { "$b64": "..." }
  - derived: user_profiles.alias_lower, retired_aliases.alias_lower and
    table_name_proposals.name_lower are computed when absent
  - "replace" deletes all rows of that table first (same transactionSync)
  - inserts are chunked by rowsPerInsert; errors -> 400 VALIDATION_ERROR with the failing row index

GET  /api/v1/__ops/export?table=<name>&after=<rowid>&limit=<<=1000>
  -> 200 { rows: object[], next: number | null }   // rows keyed like import input; blobs as { "$b64" }
```

Constraints:

- These paths are handled in `AppDO.fetch` before the Hono app. They are not in `app.routes`, so the route-coverage test does not see them.
- W3-B tests them directly with better-sqlite3.
- During the bulk import, every table import runs inside `transactionSync` with `PRAGMA defer_foreign_keys = ON`.

---

## 3. Work items

Format for each item: goal, owned files, contracts provided/consumed, depends on, verification.

### Wave 1 — foundations (W1-A, W1-B, W1-C in parallel)

#### W1-A — SQLite schema, clients, migrations, seed

**Owns:** `packages/database/**` (including `package.json`, `drizzle.config.ts`, `migrations/**`, all `src/**` and tests).

**Do:**

- **Schema.** Port the 18 remaining schema files to `sqlite-core` per 2.1. Drop `app-secrets.ts` and the adapter table. Add `scheduled-jobs.ts`. Keep `index.ts` export names.
- **Clients.**
  - `client.ts`: types and chunk helpers.
  - `do.ts`: `drizzle(storage, { schema })` from `drizzle-orm/durable-sqlite`, plus `migrateDo` using `migrations/migrations.js`.
  - `testing.ts`: better-sqlite3 with `PRAGMA foreign_keys = ON`, the better-sqlite3 migrator on the same `migrations` folder, and `buildTemplate()` returning `sqlite.serialize()`.
- **Package exports:**
  - `"."` → `./src/index.ts`
  - `"./do"` → `./src/do.ts`
  - `"./testing"` → `./src/testing.ts`
  - `index.ts` must not import `do.ts` or `testing.ts` (each one pulls a runtime-specific driver).
- **Migrations.** Delete the pg migrations. Set `drizzle.config.ts` to `{ dialect: "sqlite", driver: "durable-sqlite", schema: "./src/schema/index.ts", out: "./migrations" }`. Run `drizzle-kit generate --name baseline` and commit `.sql`, `meta/` and `migrations.js`.
- **Seed.** Keep the same upsert semantics, using `onConflictDoUpdate` with `excluded.*` via `sql\`excluded.<col>\``. Chunk with `rowsPerInsert`. Keep the no-lat/lng-overwrite rule.
- **Dependencies:** remove `pg`, `@types/pg`, `@electric-sql/pglite`. Add `better-sqlite3@13.0.3` and `@types/better-sqlite3` as dev dependencies, and `@cloudflare/workers-types` as a dev dependency (types for `do.ts`).
- **Tests:**
  - Port `db.test.ts`: partial unique indexes on check-ins (user and seat, ACTIVE only), FK enforcement, check constraints, folded alias uniqueness, `scheduled_jobs` round-trip, timestamp and boolean and json and blob round-trips.
  - Add a seed idempotency test (run twice: 108 seats, 1 chat room).
  - Add a `chunk` / `rowsPerInsert` / `inChunks` test with more than 100 values.
  - Keep `layout.test.ts`.
  - Add a test asserting that `db.transaction(async () => …)` throws. This documents the sync rule.
- **Scripts:** `db:generate` stays. Remove `db:migrate` and `db:seed` (the DO migrates itself).

**Provides:** contract 2.1. **Depends on:** nothing.

**Verify:**

```
pnpm --filter @sala/database typecheck
pnpm --filter @sala/database test
pnpm --filter @sala/database exec drizzle-kit generate && git status --porcelain packages/database/migrations   # must print nothing
```

#### W1-B — API platform, HTTP primitives, test harness

**Owns (Wave 1):**

- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/.dev.vars.example`, `apps/api/scripts/check-port.mjs`
- `apps/api/src/env.ts`, `src/services.ts`, `src/platform/**`, `src/http/{context,guards,validate,reply}.ts` (+ tests)
- `src/common/**`, except the files W3-A deletes later (W1-B may leave them untouched)
- `src/test-utils.ts`, `src/test-global-setup.ts`
- root `.gitignore` (add `.wrangler/`, `.open-next/`, `.dev.vars`)

**Do:**

- **`package.json`.**
  - Add `hono@4.13.13`, `wrangler@4.151.0` (dev), `@cloudflare/workers-types` (dev), `better-sqlite3@13.0.3` + types (dev), `aws4fetch`, `@pushforge/builder@2.0.5`, `@anthropic-ai/sdk` (same version range as `apps/verifier`).
  - Bump `better-auth` to `1.7.8`.
  - Keep every legacy dependency for now (rule 0.2.4).
  - Scripts:
    - `dev`: `wrangler dev --port 4000`
    - `build`: `wrangler deploy --dry-run --outdir dist`
    - `deploy`: `wrangler deploy`
    - `test`: `vitest run --testTimeout=30000 --hookTimeout=60000`
    - `typecheck` and `lint` unchanged.
- **`tsconfig.json`.** Add `@cloudflare/workers-types` and `node` to `types`, plus `"lib": ["ES2023"]`. If DOM/Node/Workers type clashes appear, switch to the `wrangler types` output and document the choice in the file header.
- **`env.ts`.** Per 2.2. No `dotenv`, no `fs`. Update `env.test.ts`.
- **Platform modules.** Write `platform/clock.ts`, `platform/logger.ts` and `platform/scheduler.ts` per 2.5 and 2.6. Scheduler tests cover: one-shot replace, `scheduleIfAbsent`, recurring advance-before-run, a handler error does not stop later jobs, re-entrancy guard, `nextDueAt`, prefix dispatch.
- **Common modules.**
  - `common/api-error.ts` per 2.10 (keep messages byte-identical; port the existing tests).
  - `common/sqlite-errors.ts` + tests (fake better-sqlite3 errors and DO-style message errors).
  - Turn `common/pg-errors.ts` into a shim.
  - `common/background.ts`: switch to the platform `Logger` type.
  - `common/cache/*`: remove Nest decorators; delete `cache.module.ts`.
- **HTTP primitives.** Write `http/*.ts` per 2.8, with tests using a tiny Hono app and stub services: guard 401, restricted 403, admin 403 message, `uuidParam` 400, `zBody` 400, `reply` null giving an empty body.
- **`services.ts`.** Per 2.8.
- **Test harness.**
  - `test-global-setup.ts`: build the template once (`buildTemplate()`) and write it to a temp file. Provide its path through `process.env.SALA_TEST_TEMPLATE`.
  - `test-utils.ts`: `freshDb()` returns `createTestDb({ template })`.
  - Keep `insertUsers`, `getRoom` and `getSeats`.
  - `countQueries(db, fn)` uses a per-db logger counter. `freshDb({ countQueries: true })` returns `{ db, queries: () => number }`. Adapt existing callers' signature only if unavoidable; prefer the same call shape.
  - Keep the `build*Service` helpers with the same constructor arguments. Add a `ManualScheduler` argument to `buildNotificationService` (W2-E appends the `scheduler` constructor parameter). Build `RoomRealtimeGateway` with `RecordingHub`.
  - Remove all PGlite/Postgres/Redis env hoisting from shared helpers.
- **`scripts/check-port.mjs <paths…>`.** Exit 1 on any appendix A.2 pattern in non-test `.ts` files under those paths. Print `file:line:pattern`.

**Provides:** 2.2, 2.5, 2.6 (class), 2.8, 2.10, 2.11, harness. **Consumes:** 2.1 (code against the contract; real package from W1-A at merge). **Depends on:** nothing. W1-A merges first within the wave if possible.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/platform src/http src/common src/env.test.ts
node apps/api/scripts/check-port.mjs apps/api/src/platform apps/api/src/http
```

#### W1-C — Realtime, both ends

**Owns:**

- `apps/api/src/realtime/**`
- `apps/web/src/lib/socket.ts`, `apps/web/src/lib/realtime-protocol.ts`, `apps/web/src/lib/__tests__/socket.test.ts`
- `apps/web/src/components/AnnouncementsBanner.tsx` (type import only)
- `apps/web/package.json` (Wave 1: remove `socket.io-client`)

**Do:**

- **Server.** Write `realtime-hub.ts`, `do-realtime-hub.ts`, `ws-protocol.ts`, `ws-server.ts`, the gateway rewrite and `realtime-token.router.ts` per 2.7.
  - Port every existing realtime test to `RecordingHub` and fake sockets: limits, join rules, token, bucket, blocked users, the session sweep.
  - Keep `resolveSocketUserId` tests.
  - Delete `realtime.module.ts`, `postgres-adapter.ts` and the token controller.
- **Fake DO state for tests.** `acceptWebSocket(ws, tags)` stores sockets. `getWebSockets(tag?)` filters. Fake sockets implement `send`, `close`, `serializeAttachment` and `deserializeAttachment`.
- **Web facade.** Per 2.7.
  - Tests with a mock `WebSocket` class: ack round-trip, emit buffering before open, reconnect with backoff, fresh token per attempt, `resetSocket`, SSR stub, `"connect"`/`"disconnect"` events, ping/pong timeout.

**Provides:** 2.7. **Consumes:** 2.5, 2.6 (Scheduler interface), 2.8 (`AppEnv`, `requireAuth`). **Depends on:** nothing. Code against the contracts; the gate is the end of Wave 1.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/realtime
pnpm --filter @sala/web exec vitest run src/lib/__tests__/socket.test.ts
pnpm --filter @sala/web typecheck
node apps/api/scripts/check-port.mjs apps/api/src/realtime
```

### Wave 2 — service ports (W2-A through W2-F in parallel)

**Common recipe for every Wave 2 item:**

1. Remove `@Injectable`, `@Inject(...)` and every `@nestjs/*` import. Keep constructor parameter order and types, so `test-utils` builders stay valid. Replace `@Inject(DB) db: Db` with a plain `db: Db`. Import `Logger` from `../platform/logger.js`.
2. **Transactions.**
   - Change `await db.transaction(async (tx) => {…})` to `db.transaction((tx) => {…})`. Inside, use `.all()`, `.get()`, `.run()`, `.values()` and `tx.query.x.findFirst(...).sync()`. Never use `await` inside a transaction.
   - Move every external I/O (fetch, push, email, verifier, R2) and every realtime emit to after the transaction returns.
   - If a decision depends on a fetch result, do the fetch first, then open the transaction and re-read the rows it depends on.
   - No nested transactions (`tx.transaction` is forbidden; DO SQLite rejects savepoints).
3. Remove `.for("update")`, `pg_advisory_xact_lock`, `SKIP LOCKED`. The sync transaction plus the DO single thread replaces them.
4. Rewrite raw SQL per appendix A.1. With raw `sql` templates, pass dates as `date.getTime()` and read them back with `new Date(Number(v))`.
5. Chunk `inArray` with more than 90 values and multi-row inserts (`inChunks`, `rowsPerInsert`).
6. Replace each controller with a router per 2.9 (guards to middleware, pipes to `zBody`/`uuidParam`, status-code rule, `reply`). Delete `*.controller.ts` and `*.module.ts` in owned directories.
7. Port the owned tests:
   - Same intent and same assertions.
   - Swap PGlite setup for `freshDb()`.
   - Concurrency tests (`Promise.all` collisions) must still assert one winner.
   - Tests may not be deleted. Tests that only checked pg mechanics (advisory lock calls, `SKIP LOCKED` SQL text) are rewritten to assert the observable behavior.
8. Run `check-port.mjs` on owned directories.

**Gate caveat.** Tests in an owned directory may fail transiently because they exercise another group's unported service. A failure counts as acceptable for the item only if the stack trace's first application frame is outside owned directories. The end-of-wave gate requires everything green.

#### W2-A — Occupancy core

**Owns:** `apps/api/src/{rooms,presence,checkins,observations}/**`.

**Critical behaviors:**

- `SeatStateCalculator` stays pure.
- **Check-in:** one ACTIVE per user and one ACTIVE per seat. Moving seats ends the old check-in and creates the new one in one transaction. Concurrent collision gives exactly one 201 and one 409 `SEAT_TAKEN`.
- Check-in lasts 180 min; extend works as today.
- Initial observation durations: FREE 15 min, OCCUPIED 20 min.
- **Geofence** validation stays server-side.
- `room-state.service`, `room-stats.service`: timezone and day bucketing move to JS (`date-fns-tz`).
- `photo-verification.service`: the verifier call happens before the transaction that records the verification. Re-read the check-in inside the transaction.
- **Router (`checkinsRouter`):** call `services.notifications.scheduleAdminPresent(roomId, user.id)`, which is the new 2-argument signature (contract 2.6).
- **Body limit:** 3 MB on `/checkins/:id/photo` is applied by W3-A middleware. The router does not re-limit.

**Consumes:** 2.1, 2.6, 2.7 (gateway), 2.8, 2.11. **Depends on:** Wave 1.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/rooms src/presence src/checkins src/observations
node apps/api/scripts/check-port.mjs apps/api/src/rooms apps/api/src/presence apps/api/src/checkins apps/api/src/observations
```

#### W2-B — Disputes, table names, reputation, study, rankings

**Owns:** `apps/api/src/{disputes,table-names,reputation,rankings,study}/**`.

**Critical behaviors:**

- **Disputes** (807 lines, 19 pg sites):
  - Open, vote and respond are each one sync transaction.
  - The resolution sweep is used by `DisputeResolutionJob.tick()`. Keep its method signature.
  - Rule: no votes within 5 min means the opener wins (intended).
  - `isUniqueViolation` targets for the `status = 'OPEN'` partial indexes.
- **Table names:** use `name_lower` everywhere `lower(name)` was used. Set `nameLower` on every insert and update.
- **Rankings** (`DISTINCT ON`, `AT TIME ZONE`, `date_trunc`): compute window bounds in JS with `date-fns-tz`. Replace `DISTINCT ON` with a `row_number()` subquery or JS reduction. Keep response headers.
- `study-session.service` and `study.service`: start/stop atomic.

**Consumes/Depends:** as W2-A.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/disputes src/table-names src/reputation src/rankings src/study
node apps/api/scripts/check-port.mjs apps/api/src/disputes apps/api/src/table-names apps/api/src/reputation apps/api/src/rankings apps/api/src/study
```

#### W2-C — Social and identity

**Owns:** `apps/api/src/{chat,dm,groups,blocks,profiles,avatars,users}/**`.

**Critical behaviors:**

- **Aliases:** `alias.service`, `profiles.service` and alias retirement set `aliasLower` on every write. Lookups use the folded column. `alias-generator` stays pure.
- **Avatars:** the `bytes` blob (`Buffer`) stays at or under 300 KB. Google avatar fetch happens outside any transaction. The GET returns binary with the same headers. The 1 MB body limit is applied by W3-A.
- **Groups and DM:** membership checks and message inserts are each one sync transaction. Realtime emits happen after it.
- `users/roles.service`, `restriction.service`: same API (consumed by the guards). Delete `users/admin.guard.ts` and `users.module.ts`.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/chat src/dm src/groups src/blocks src/profiles src/avatars src/users
node apps/api/scripts/check-port.mjs apps/api/src/chat apps/api/src/dm apps/api/src/groups apps/api/src/blocks apps/api/src/profiles apps/api/src/avatars apps/api/src/users
```

#### W2-D — Admin, moderation, reports, announcements, QR

**Owns:** `apps/api/src/{admin,reports,announcements,qr}/**`.

**Critical behaviors:**

- `admin-rooms.service`: "mark all occupied" and undo are each one transaction over 108 seats. Chunk the inserts. Geofence test and update work as today.
- `moderation-action.service`: ban/suspend writes restrictions in a transaction, then calls `realtime.disconnectUser(userId)` after it.
- **Reports:** attachments use `services.storage` (W2-F contract below) for presign PUT/GET. Keep the same DTOs.
- **QR:** token create/list/delete; the public GET resolves the token.
- `admin-audit`, `admin-users`: pagination queries ported.

**Consumes:** the W2-F storage contract.

```ts
// src/storage/storage.service.ts (W2-F) - same public surface as today
export class StorageService {
  constructor(bucket: R2Bucket | null);            // EVIDENCE binding; presigning uses env R2_* keys
  isEnabled(): boolean;
  presignPut(contentType: string, contentLength: number): Promise<{ objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: Date }>;
  presignGet(objectKey: string): Promise<string>;  // 60 s
  head(objectKey: string): Promise<{ size: number; contentType: string | null } | null>;
  deleteObject(objectKey: string): Promise<void>;
}
```

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/admin src/reports src/announcements src/qr
node apps/api/scripts/check-port.mjs apps/api/src/admin apps/api/src/reports apps/api/src/announcements apps/api/src/qr
```

#### W2-E — Notifications, push, email, subscriptions, security

**Owns:** `apps/api/src/{notifications,email,subscriptions,security}/**`. Exception: `security/authorization.http.test.ts` and `security/route-auth-coverage.http.test.ts` move to W3-A.

**Critical behaviors:**

- **`NotificationService`:**
  - Append constructor parameter `scheduler: Scheduler` (last).
  - `scheduleAdminPresent(roomId, adminUserId): void` uses `scheduler.schedule("admin-present:"+adminUserId, now + randomInt(2, 5 min), { roomId, adminUserId })`.
  - `fireAdminPresent(roomId, adminUserId, emitBanner)` becomes public.
  - `handleSeatFreed(roomId, changes, summary?)` signature and return shape stay unchanged.
- **Push:** replace `web-push` with `@pushforge/builder` (VAPID JWT + aes128gcm payload, then `fetch`).
  - Keep `push-endpoint-allowlist.ts`, the concurrency cap (`notifications/concurrency.ts`), and the 404/410 subscription pruning.
  - VAPID keys come only from env (no generation at runtime).
- **Email:**
  - `EmailSendJob` keeps `tick()` and `runSweep(now)`. Remove `@Interval`.
  - Claim rows in one sync transaction (mark `SENDING` with a lease), send via Resend outside it, then mark the result in another transaction. This replaces `SKIP LOCKED`.
  - `email-recipients.ts`: 6 raw-SQL sites ported.
  - Unsubscribe tokens unchanged.
- **Subscriptions:** the Mercado Pago client stays fetch-based. Webhook signature verification unchanged. State changes are one transaction each.
- **Security:**
  - `rate-limit.service`: keep only the SQLite fixed-window path on `rate_limit_hits`, with the same public methods and results. Prune expired windows opportunistically (at most once per minute) so the table does not grow.
  - Remove the Upstash and ioredis branches and their tests.
  - `turnstile.service` unchanged (fetch).
  - `anti-abuse`, `abuse-policy` and `security-event` services ported.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/notifications src/email src/subscriptions src/security --exclude "src/security/*.http.test.ts"
node apps/api/scripts/check-port.mjs apps/api/src/notifications apps/api/src/email apps/api/src/subscriptions apps/api/src/security
```

#### W2-F — Verifier fold-in and R2 storage

**Owns:** `apps/api/src/{verification,storage}/**`, `apps/verifier/**` (delete).

**Do:**

- **Fold the verifier.** Move `apps/verifier/src/{seat-locator,gemini-locator,layout-description,schema}.ts` into `apps/api/src/verification/locator/`.
  - Replace `loadPlan()` (`readFileSync`) with `plan-image.ts`, which exports `PLAN_WEBP_BASE64` and `PLAN_MIME = "image/webp"`.
  - Generate it with `apps/api/scripts/embed-plan.mjs` (owned by W2-F) from `apps/verifier/assets/plano.webp`. Move the asset to `apps/api/assets/plano.webp`.
- **`InProcessSeatPhotoVerifier implements SeatPhotoVerifier`:**
  - Uses Gemini when `GEMINI_API_KEY` is set, else Claude via `@anthropic-ai/sdk` when `ANTHROPIC_API_KEY` is set.
  - `modelVersion` = `` `sala-seat-v1:${model}` ``.
  - 8 MB input limit kept.
- **`seat-photo-verifier.factory.ts`:**

  ```ts
  export function createSeatPhotoVerifier(e?: Env): SeatPhotoVerifier | null;
  ```

  Selection: mock in development without keys → in-process when a key is set → HTTP verifier when `SEAT_VERIFIER_URL` is set (https in production) → `null`. Delete `seat-photo-verifier.tokens.ts` and `verification.module.ts`.
- **Storage.** `StorageService` per the W2-D contract. Presigned PUT/GET use `aws4fetch` `AwsClient.sign(…, { aws: { signQuery: true } })` against `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>`. Sign `content-type` and `content-length` (5 min PUT, 60 s GET). `head` and `deleteObject` use the R2 binding.
- **Tests:** port the verifier tests from `apps/verifier` (locator schema parsing, layout description; mock fetch for providers) and the storage tests (URL shape, signed headers, expiry).

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/verification src/storage
node apps/api/scripts/check-port.mjs apps/api/src/verification apps/api/src/storage
```

### Wave 3 — HTTP app, DO, jobs (W3-A and W3-B in parallel)

#### W3-A — Hono app, middleware, Better Auth, container, HTTP tests

**Owns (Wave 3):**

- `apps/api/src/http/app.ts`, `src/http/middleware/**`, `src/http/{health,auth-providers,e2e-test-hooks}.router.ts`
- `src/auth/**`, `src/container.ts`
- `src/security/authorization.http.test.ts`, `src/security/route-auth-coverage.http.test.ts`
- `src/services.ts` (Wave 3 final fix-ups)
- deletions listed for W3-A in 1.2

**Do:**

- **`auth.instance.ts`: `buildAuth(db)`.**
  - `drizzleAdapter(db, { provider: "sqlite", schema, transaction: false })`.
  - Same email/password, Google (optional), verification/reset via Resend, ban hook (`APIError FORBIDDEN`, code `ACCOUNT_BANNED`), cookie cache 60 s, and the same rate-limit rules (sign-in 5/min, sign-up 3, request-password-reset 3, reset-password 5, send-verification-email 3; global 100 per 60 s).
  - `advanced.ipAddress.ipAddressHeaders = ["cf-connecting-ip"]`.
  - Production cookies: `sameSite: "lax"`, `secure: true`.
  - Keep `hasActiveBan` and `type Auth`.
- **`container.ts`:**

  ```ts
  export interface ContainerDeps { db: Db; hub: RealtimeHub; scheduler: Scheduler; evidence: R2Bucket | null; clock: Clock }
  export function buildServices(deps: ContainerDeps): Services;
  ```

  Wire services by hand, using the `test-utils` builders as the reference graph. Order: `roomState` → `notifications` → `realtime` gateway. Also construct `jobs.*` instances (W3-B classes keep today's constructor signatures).
- **`http/app.ts`:**

  ```ts
  export interface AppDeps { services: Services; auth: Auth }
  export function createApp(deps: AppDeps): Hono<AppEnv>;
  ```

  Middleware order mirrors `main.ts`:
  1. Context: set `services`, `auth`, and `ip` from `cf-connecting-ip` ?? `"127.0.0.1"`.
  2. Maintenance gate: when `env.maintenanceMode`, every `/api/*` path except `/api/v1/health*` returns 503 `FEATURE_DISABLED` with the message "Mantenimiento en curso.".
  3. Security headers via Hono `secureHeaders`, equivalent to today's helmet config:
     - `Strict-Transport-Security` in production
     - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
     - `Cross-Origin-Resource-Policy: same-site`
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: no-referrer`
  4. CORS with credentials for `env.webOrigins` (local dev cross-origin only).
  5. Slow-request log (≥800 ms or status ≥500).
  6. `/api/v1/*` global IP rate limit, 300/min per `ip` (skipped when `env.e2eTestHooks`).
  7. CSRF origin check on unsafe methods. Port `csrf.middleware.ts` exactly, including its exemptions.
  8. `/api/auth/*`: the auth rate-limit middleware, then `app.on(["GET","POST"], "/api/auth/*", c => auth.handler(c.req.raw))`.
  9. Body limits:
     - `POST /api/v1/checkins/:id/photo` 3 MB, only when the session cookie regex matches; else 100 KB.
     - `/api/v1/profiles/me/avatar` 1 MB under the same rule.
     - Everything else 100 KB.
     - Over the limit: 413 mapped through `toErrorResponse` (`VALIDATION_ERROR`, as with Express today).
  10. `api = new Hono().basePath("/api/v1")`; mount the routers in the 2.9 order.
  11. `onError` and `notFound` per 2.10.
- **HTTP tests.** Port `authorization.http.test.ts` and `route-auth-coverage.http.test.ts`:
  - Build `createApp` over `freshDb()`, `RecordingHub` and `ManualScheduler`.
  - Drive it with `app.request(path, init)`, adding the headers `origin: http://localhost:3000` and `cf-connecting-ip: 127.0.0.1`.
  - Route enumeration uses `app.routes` (method + path, skipping middleware entries with method `ALL`).
  - Keep the `PUBLIC_ROUTES` list as-is. Adjust only path syntax, if Hono reports `:param` the same way Express did.
  - Port the remaining middleware tests (csrf, auth-rate-limit, global-ip-rate-limit) into `src/http/middleware/*.test.ts`.

**Consumes:** every router from Wave 2, 2.8, 2.10, W3-B job classes (constructor signatures unchanged). **Depends on:** Wave 2.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/http src/auth src/security/authorization.http.test.ts src/security/route-auth-coverage.http.test.ts
pnpm --filter @sala/api typecheck      # end-of-Wave-3 gate, together with W3-B
node apps/api/scripts/check-port.mjs apps/api/src/http apps/api/src/auth apps/api/src/container.ts
```

#### W3-B — Durable Object, Worker, scheduler wiring, jobs, ops endpoints

**Owns (Wave 3):** `apps/api/wrangler.jsonc`, `src/worker.ts`, `src/do/**`, `src/ops/**`, `src/jobs/**` (except `e2e-test-hooks.controller.ts`, which W3-A deletes), `scripts/smoke.mjs`.

**Do:**

- **Worker and DO.** Write `worker.ts`, `do/app-do.ts` and `do/runtime.ts` per 2.4.
  - `buildRuntime` creates:
    - `SqliteScheduler` (`onNextDueChanged` re-arms the alarm when the new time is earlier than the current alarm)
    - `DoRealtimeHub`
    - services via `buildServices`
    - `buildAuth`
    - `createApp`
    - `RealtimeSockets`
  - It then calls `registerJobs`.
- **Jobs.** Port the `jobs/*.job.ts` files: remove `@Interval`/`@Cron`/Nest, keep `tick()`/`runSweep(now)`. Keep the `resetInstantFor` and `localDateOf` exports of `daily-reset.job.ts`. Use the `Tx` type from `@sala/database`.
  - **Daily reset:** at ~04:00 America/Argentina/Buenos_Aires per room: one transaction per room, then `emitDailyReset` after it.
  - **Expiration:** expires check-ins/observations in a transaction, then `broadcastSeatChanges`.
  - **Reminder:** `emitCheckInExpiring` and push 10 min before expiry ("Sigo acá").
  - **Dispute resolution:** calls the W2-B sweep.
  - **Attachment sweep:** R2 deletes happen outside transactions.
- **`jobs/register-jobs.ts`:**

  ```ts
  export function registerJobs(scheduler: SqliteScheduler, services: Services, sockets: RealtimeSockets): void;
  ```

  Implements the 2.6 tables.
- **Ops.** `ops/ops-handler.ts` per 2.12:

  ```ts
  export function handleOps(req: Request, db: Db, e: Env): Promise<Response | null>;
  ```

  Tests run with better-sqlite3: token required, disabled when the token is empty, FK order list, conversions, derived columns, replace mode, chunking past 100 parameters.
- **`wrangler.jsonc`.** Per 2.3. Copy the non-secret var names and values from the current `fly.toml` `[env]` section (not from any `.env` file).
- **`scripts/smoke.mjs [baseUrl]`.** Default `http://localhost:4000`. Checks:
  - `GET /api/v1/health` returns 200.
  - `GET /api/v1/rooms/principal/map` returns 200 with 108 seats.
  - `GET /api/v1/me` anonymous returns 200 with `user: null` (today's shape).
  - `POST /api/v1/checkins` anonymous returns 401 `UNAUTHENTICATED`.
  - Security headers are present.
  - WebSocket connect, then `room:join` acks `{ joined: true }`.
  - Optional `--signup` path: sign up two users, then a concurrent check-in on the same seat (requires `PRESENCE_DEV_BYPASS=1`) gives exactly one 201.
- **Job tests.** Port the job tests to `ManualScheduler` / `FixedClock`: daily reset at 04:00 ART including around midnight UTC, expiration, reminder, attachment sweep.

**Consumes:** 2.1 (`do` subpath), 2.6, 2.7, `buildServices` and `createApp` (W3-A, same wave; code against the contract). **Depends on:** Wave 2.

**Verify:**

```
pnpm --filter @sala/api exec vitest run src/jobs src/ops src/do
pnpm --filter @sala/api exec wrangler deploy --dry-run --outdir dist
# in one terminal:
pnpm --filter @sala/api exec wrangler dev --port 4000 --var PRESENCE_DEV_BYPASS:1 --var NODE_ENV:development --persist-to .wrangler/smoke
# in another:
node apps/api/scripts/smoke.mjs http://localhost:4000 --signup
```

### Wave 4 — web, CI/CD, cleanup (W4-A, W4-B, W4-C in parallel)

W4-A has no dependency on the API waves. It may start right after Wave 1 if builder capacity exists. It is listed in Wave 4 to match the requested plan.

#### W4-A — Next.js on Workers (OpenNext)

**Owns:**

- `apps/web/{wrangler.jsonc,open-next.config.ts,cloudflare-env.d.ts,next.config.ts,package.json,playwright.config.ts}`
- `apps/web/src/proxy.ts`, `apps/web/src/lib/{hosts,csp}.ts`, `apps/web/src/lib/__tests__/proxy.test.ts`
- `apps/web/.env.example`

**Do:**

- Read `apps/web/AGENTS.md` and `node_modules/next/dist/docs/` before editing (Next 16 has breaking changes).
- **Dependencies:** add `@opennextjs/cloudflare@1.20.11` and `wrangler@4.151.0` (dev).
- **Scripts:**
  - `build:cf`: `opennextjs-cloudflare build`
  - `preview`: `opennextjs-cloudflare build && opennextjs-cloudflare preview`
  - `deploy`: `opennextjs-cloudflare build && opennextjs-cloudflare deploy`
  - `cf-typegen`: `wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts`
  - `build` stays `next build` (used by CI).
- **`open-next.config.ts`:** `defineCloudflareConfig({})`. No R2 incremental cache. If the build reports ISR/`revalidate` routes, use `staticAssetsIncrementalCache` and document that in the file.
- **`next.config.ts`:**
  - Remove `NEXT_OUTPUT_STANDALONE` handling.
  - Keep the rewrites only when `API_PROXY_TARGET` is set (local dev). Keep the dev avatar rewrite.
  - Keep the security headers and the `/sala/principal` redirect.
  - Add `initOpenNextCloudflareForDev()` in dev, per the OpenNext docs.
  - If `next/image` optimization is used for local or remote images, set `images.unoptimized = true`. This avoids paid Image transformations. Note it in a comment.
- **`proxy.ts`:**
  - Remove the proxy-secret logic and the `fly.dev` host.
  - Keep the per-request CSP nonce (`x-nonce` and `content-security-policy`), the static-path skip and the matcher.
  - Keep the `www.saladeestudio.com.ar` → canonical 308 redirect.
- **`hosts.ts`:** `LEGACY_HOSTS = ["www.saladeestudio.com.ar"]`.
- **`csp.ts`:** `connect-src` includes `'self'` and `wss://saladeestudio.com.ar` in production; in dev, the origin derived from `NEXT_PUBLIC_SOCKET_URL` (`ws://localhost:4000`).
- **Fallback if OpenNext cannot run `proxy.ts`.** First try `proxy.ts` as-is. If the OpenNext build rejects the Node-runtime proxy:
  1. Rename it to `middleware.ts` with the same code and the edge runtime. Next 16 still accepts this, with a deprecation warning.
  2. If that also fails: move host redirects into a Cloudflare Redirect Rule (user step), and generate the CSP nonce through the `headers()` + layout path. Explain the change in the PR.
- **`proxy.test.ts`:** drop the secret cases; keep the CSP, www redirect and static-skip cases.
- **`playwright.config.ts`:** webServer becomes `pnpm --filter @sala/api exec wrangler dev --port 4000 --persist-to .wrangler/e2e --var E2E_TEST_HOOKS:1 --var PRESENCE_DEV_BYPASS:1 --var NODE_ENV:development`. Delete `.wrangler/e2e` in global setup. The web server stays `next dev` with `API_PROXY_TARGET=http://localhost:4000` and `NEXT_PUBLIC_SOCKET_URL=ws://localhost:4000`.
- **`.env.example`:** document `API_PROXY_TARGET` (dev only) and `NEXT_PUBLIC_SOCKET_URL` (dev only). Remove the Fly and proxy-secret mentions.

**Verify:**

```
pnpm --filter @sala/web typecheck && pnpm --filter @sala/web lint && pnpm --filter @sala/web test
pnpm --filter @sala/web exec opennextjs-cloudflare build      # bundle must stay < 10 MB compressed (printed by wrangler --dry-run)
pnpm --filter @sala/web exec wrangler deploy --dry-run
pnpm --filter @sala/web preview   # then: curl -sI http://localhost:8787/ shows content-security-policy with nonce, HSTS, nosniff
```

#### W4-B — CI/CD, root config, ops scripts, dependency cleanup

**Owns (Wave 4):**

- `.github/workflows/{deploy,ci}.yml`
- root `package.json`, `turbo.json`, `apps/api/package.json` (cleanup)
- `ops/**` (new scripts; delete Fly scripts)
- the root Fly/Docker files listed in 1.2

**Do:**

- **`apps/api/package.json`:**
  - Remove `@nestjs/*`, `reflect-metadata`, `rxjs`, `socket.io`, `@socket.io/postgres-adapter`, `@upstash/*`, `ioredis`, `ioredis-mock` (+ types), `pg` (+ types), `@electric-sql/pglite`, `express` (+ types), `cors` (+ types), `helmet`, `dotenv`, `web-push` (+ types), `@aws-sdk/*`, `tsup`, `tsx` (if unused).
  - Remove any `import "reflect-metadata"` left in tests.
- **Root `package.json`:** remove the `socket.io` override and the `ioredis-mock` `peerDependencyRules`. Keep the k6 scripts.
- **`turbo.json`:** outputs add `.open-next/**`. Keep `dist/**` and `.next/**`. Env: keep `API_PROXY_TARGET` and `NEXT_PUBLIC_*`; add `CLOUDFLARE_*` to `passThroughEnv` for deploy tasks only if needed.
- **`ci.yml`:**
  - Drop the `PGLITE_DIR` env.
  - Keep gitleaks, audit, lint/typecheck/test and the drizzle-kit sync check (now sqlite).
  - Replace the builds with `pnpm --filter @sala/api build` (wrangler dry-run) and `pnpm --filter @sala/web exec opennextjs-cloudflare build`.
  - Semgrep: remove `--config p/dockerfile`.
- **`deploy.yml`.** Trigger: push to `main`. Concurrency group `deploy-production`. Jobs:
  - `ci` (reuse `ci.yml`).
  - `api`: `pnpm --filter @sala/api exec wrangler deploy` with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets.
  - `web` (needs `api`): `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. `NEXT_PUBLIC_*` come from GitHub repository variables, with the same names used by the current Fly build args.
  - `smoke`: today's checks against `https://saladeestudio.com.ar` (API health, 401 on protected, header checks, web headers), plus `node apps/api/scripts/smoke.mjs https://saladeestudio.com.ar` without `--signup`.
  - Remove the migrate and verifier jobs (the DO migrates itself).
- **New ops scripts** (PowerShell, matching current ops style). None of them may print secret values.
  - `ops/set-worker-secret.ps1 -Name X [-Worker uns-api]`: reads the clipboard, pipes to `wrangler secret put X --name uns-api` through stdin, clears the clipboard.
  - `ops/copy-app-secrets.ps1`: given a Postgres URL in an env var supplied by the user at run time, reads `app_secrets` (`BETTER_AUTH_SECRET`, `IP_HASH_SALT`, VAPID keypair) via `psql` and pipes each into `wrangler secret put`. The VAPID public key goes to the var list instead (prints it, because it is public).
  - `ops/export-fly-pg.ps1 -OutDir`: through `fly proxy`, runs `\copy (select row_to_json(t) from "<table>" t) to '<OutDir>/<table>.ndjson'` for every table returned by `GET /api/v1/__ops/tables` (or a static list from the schema). Skips `app_secrets` and the adapter table.
  - `ops/import-to-do.mjs --base <url> --dir <OutDir>`: reads `OPS_IMPORT_TOKEN` from env, imports in FK order, 500 rows per request. After import it compares `GET /__ops/tables` counts against the NDJSON line counts and exits 1 on any mismatch.
  - `ops/backup-do.ps1 -OutDir`: pages `/__ops/export` for every table into NDJSON.
- **`.gitignore`:** remove the PGlite entries if present (W1-B already added the Cloudflare ones).

**Verify:**

```
pnpm install --frozen-lockfile    # after the orchestrator regenerates the lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
actionlint .github/workflows/*.yml        # if available; else `npx --yes action-validator`
node ops/import-to-do.mjs --help
```

#### W4-C — Fly removal in docs, load tests and code comments

**Owns (Wave 4):**

- `00_START_HERE.md`, `02_ARCHITECTURE.md`, `10_ENVIRONMENT_AND_SERVICES.md`, `README.md`, `handoff.md`, `PRODUCT.md`, `CLAUDE.md` (stack and deploy lines only)
- `docs/SECURITY_CHECKLIST.md`, `docs/SEAT_PHOTO_VERIFIER.md`, root `.env.example`
- `tests/load/**`, `.github/workflows/load-tests.yml`
- any other file the banned-terms grep flags that no other Wave 4 item owns. Code comments under `apps/**` are allowed only after W4-A and W4-B merge, as a final pass.

**Do:**

- Replace the Fly/PGlite/Upstash/socket.io/proxy-secret descriptions with the Cloudflare architecture (sections 0.1 and 2 of this file).
- In `CLAUDE.md`:
  - Edit only the stack bullets (Neon/Upstash/Socket.IO/Fly lines) to name Workers, Durable Object SQLite, WebSocket Hibernation, R2 and Turnstile.
  - Preserve the user's uncommitted edits. Read the file fresh and change only those lines.
- **Load tests:** base URL default `https://saladeestudio.com.ar`. Remove the Fly host references and any socket.io client usage. If k6 used socket.io, switch to k6 `ws` with the 2.7 protocol.
- `docs/relevamiento-cloudflare.md` and `docs/cloudflare-migration/**` are historical and exempt.

**Verify:**

```
rg -n -i "fly\.io|fly\.toml|flyctl|fly\.dev|fly-client-ip|PGLITE|pglite|PROXY_SHARED_SECRET|x-sala-proxy|upstash|ioredis|socket\.io|NestJS|@nestjs" --glob "!docs/relevamiento-cloudflare.md" --glob "!docs/cloudflare-migration/**" --glob "!pnpm-lock.yaml" --glob "!**/node_modules/**" .
# must print nothing
```

### Wave 5 — integrated verification (one builder or the orchestrator)

**Owns:** nothing new. It fixes only defects it finds, and each fix goes to the file's last owner. Steps:

1. `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
2. Concurrency audit:
   - `rg -n "transaction\(async" apps packages` must be empty.
   - `rg -n "await " ` inside every `transaction((tx)` block is checked by reading the matches of `rg -n -A40 "\.transaction\(\(" apps/api/src` (no `await` inside the callback).
3. `node apps/api/scripts/check-port.mjs apps/api/src` must be clean.
4. Local stack:
   - `wrangler dev` (API, port 4000) and `next dev` (web, port 3000).
   - `node apps/api/scripts/smoke.mjs http://localhost:4000 --signup`.
   - `pnpm --filter @sala/web exec playwright test`: full E2E suite (map, auth, geofence bypass, check-in, realtime, observations, expiration via `__e2e`, daily reset, anti-abuse).
5. `pnpm --filter @sala/web preview`, then manually load `/`, `/sala/principal`, sign-in and the realtime map update across two tabs.
6. k6 smoke against local `wrangler dev`: `k6 run -e BASE_URL=http://localhost:4000 tests/load/scenarios/smoke.js`.
7. Banned-terms grep from W4-C must be clean.
8. Review `wrangler deploy --dry-run` sizes: API and web each under 10 MB compressed.

---

## 4. Order and parallelism

```
Wave 1:  W1-A  ||  W1-B  ||  W1-C            (W1-B and W1-C code against contracts; merge W1-A first)
            \________ gate 1 ________/
Wave 2:  W2-A || W2-B || W2-C || W2-D || W2-E || W2-F
            \________ gate 2 (tests green, tsc errors only in W3 files) ________/
Wave 3:  W3-A  ||  W3-B                      (W3-B consumes buildServices/createApp by contract)
            \________ gate 3 (api typecheck + test green, wrangler dry-run) ________/
Wave 4:  W4-A  ||  W4-B  ||  W4-C            (W4-A may start any time after gate 1)
            \________ gate 4 (repo-wide green, banned-terms clean) ________/
Wave 5:  integrated verification, then user steps (section 5)
```

**True dependencies:**

| Item | Needs | Reason |
|---|---|---|
| Wave 2 (all) | W1-A schema/Db; W1-B Logger, http primitives, harness, sqlite-errors; W1-C gateway | — |
| W2-D | W2-F `StorageService` | Contract given in W2-D, so they run in parallel |
| W2-A router | W2-E `scheduleAdminPresent` 2-arg signature | Contract 2.6, parallel |
| W3-A | Every Wave 2 router and service | — |
| W3-B | Wave 2 services; W3-A `buildServices`/`createApp` | By contract, same wave |
| W4-B dependency cleanup | Gate 3 | No Nest/pg import may remain |
| W4-A | Gate 1 only | — |
| W4-C | Nothing technical | Its final code-comment pass runs after W4-A and W4-B |

---

## 5. User-only steps (cannot be done by builders)

Do these in order. Each one needs your accounts or credentials.

1. **Workers Paid plan.** Enable it on account `8355b74d76c27ea18e007625360d9cc0` (USD 5/month; required for DO SQLite limits and 30 s CPU).
2. **Wrangler auth.**
   - Run `pnpm --filter @sala/api exec wrangler login` locally.
   - Create an API token (template "Edit Cloudflare Workers", plus zone `saladeestudio.com.ar` Workers Routes: Edit, plus Account Settings: Read).
3. **GitHub repository settings.**
   - Add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Add repository variables for every `NEXT_PUBLIC_*` value used by the web build: GA, AdSense client and slots, GAM units, Turnstile site key, app URL.
4. **DNS.** Confirm that the `saladeestudio.com.ar` apex and `www` records are proxied (orange cloud). Worker routes only fire on proxied records.
5. **Secrets copy (keep the same values).** Sessions, IP hashes and push subscriptions depend on them.
   - Run `ops/copy-app-secrets.ps1` for `BETTER_AUTH_SECRET`, `IP_HASH_SALT` and the VAPID keypair.
   - Set every other secret with `ops/set-worker-secret.ps1 -Name <NAME>` (list in 2.3), using values from your password manager or provider dashboards.
   - Generate a fresh random `OPS_IMPORT_TOKEN`.
   - Add `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` (same key the verifier uses today).
6. **Cutover window.** About 30 minutes, ideally near 04:00 ART, after the daily reset.
   1. Deploy from the branch with maintenance on: `pnpm --filter @sala/api exec wrangler deploy --var MAINTENANCE_MODE:1`. From this moment `/api/*` is served by the Worker and returns 503 (maintenance). Web is still on Fly.
   2. Stop writes on Fly: `fly scale count 0` for the API app.
   3. `ops/export-fly-pg.ps1 -OutDir <dir>`. You provide the Postgres URL in an env var for this run only.
   4. `node ops/import-to-do.mjs --base https://saladeestudio.com.ar --dir <dir>`. It must exit 0 (counts match).
   5. Redeploy the API with maintenance off: `wrangler deploy` (config value `"0"`).
   6. Deploy web: `pnpm --filter @sala/web deploy`.
   7. Run `node apps/api/scripts/smoke.mjs https://saladeestudio.com.ar`. Then sign in by hand, check in, and see realtime in two tabs.
   8. Merge `cf/migration` into `main`. From now on GitHub Actions deploys.
7. **Third-party callbacks** (same domain, so they should need no change). Verify:
   - Google OAuth redirect URI `https://saladeestudio.com.ar/api/auth/callback/google`
   - Mercado Pago webhook URL `https://saladeestudio.com.ar/api/v1/webhooks/mercadopago`
   - Resend sending domain
   - R2 bucket CORS still allows `PUT` from `https://saladeestudio.com.ar`
8. **Rollback window (7 days).** Keep Fly apps and Postgres scaled to zero, not deleted. To roll back:
   1. Delete both Worker routes (dashboard or `wrangler deploy` with routes removed).
   2. Scale Fly back up.
   Data written on Cloudflare after cutover would need `ops/backup-do.ps1` plus a manual reverse import. Accept the loss or avoid rolling back after real traffic.
9. **Decommission after 7 stable days.**
   1. Take a final backup with `ops/backup-do.ps1`.
   2. Delete the Fly apps (API, web, verifier, Postgres) and the Fly certificates.
   3. Remove the `FLY_API_TOKEN` GitHub secret.
   4. Cancel Upstash.
   5. Remove `OPS_IMPORT_TOKEN` (`wrangler secret delete OPS_IMPORT_TOKEN`) to disable the ops endpoints. Keep it only if you want `backup-do.ps1` to keep working; it is required for backups.

---

## 6. Risks and handling

| # | Risk | Handling |
|---|---|---|
| R1 | **DO placement.** Durable Objects are not placed in South America. AppDO will likely live in ENAM: +130–170 ms per API call and per WS event for Bahía Blanca users. | Accepted by design. `locationHint: "sam"` is best-effort. Monitor via observability. Later lever: Worker-side Cache API for public GETs (`/rooms/:id/map` with ETag, rankings), served at the edge without touching the DO. |
| R2 | **Hibernation tags cannot change after accept.** | Only `user:` and `ip:` are tags. Rooms and chats live in `serializeAttachment` and are filtered on publish (2.7). |
| R3 | **Interleaving in a DO.** Any `await` of real I/O lets another request run. Node tests interleave at every `await`. | Sync transactions for every read-decide-write. External I/O happens outside, followed by a re-read. Wave 5 audits for `transaction(async` and `await` inside transaction callbacks. better-sqlite3 throws if a transaction callback returns a promise, so tests catch violations. |
| R4 | **No nested transactions or savepoints** in DO SQLite. | Rule in the Wave 2 recipe. W1-A adds a test documenting it. |
| R5 | **100 bound parameters per statement.** | `chunk`/`rowsPerInsert`/`inChunks` helpers. Seed and import are chunked. Tests use more than 100 values. |
| R6 | **Raw SQL with `Date` parameters** fails on SQLite drivers. | Appendix A.1 rule (`getTime()`). `check-port.mjs` flags `${…Date` patterns heuristically. Tests exercise the paths. |
| R7 | **`lower()` is ASCII-only in SQLite** (alias uniqueness with ñ/á). | JS-folded columns (2.1), set on every write and derived on import. |
| R8 | **OpenNext + Next 16 `proxy.ts`** support is not guaranteed. | W4-A fallback ladder: `proxy.ts` → `middleware.ts` (edge) → Redirect Rule + header nonce. |
| R9 | **Coalesced summary state is in memory.** A DO restart within 250 ms drops one summary and seat-freed alert. | Accepted. Seat events themselves are emitted immediately. Clients refetch the map on reconnect. |
| R10 | **Alarm and cron double-run.** | Single-threaded DO, an in-memory running flag in `runDue`, and due_at advanced (or row deleted) before running. Jobs are idempotent (status-guarded updates). |
| R11 | **Cost overrun.** The 15 s dispute job keeps the DO awake: about 128 MB × 2.6 M s/month ≈ 332 k GB-s, under the 400 k included. Requests: Worker + DO per API call, well under 10 M / 1 M included at current traffic. | Watch the Workers analytics billing page in month 1. Lever: switch dispute resolution to one-shot jobs due at each dispute deadline, which allows hibernation. |
| R12 | **Bundle size limit** (10 MB compressed). Web with Next 16 is the risk; API with better-auth, zod and the Anthropic SDK is fine. | W4-A checks the dry-run size. Levers: `images.unoptimized`, dropping unused heavy client deps from the server bundle, lazy imports. |
| R13 | **CPU per request.** Password hashing (scrypt in JS) and image checks are CPU-heavy. | Workers Paid allows 30 s CPU by default; no config needed. Measure sign-in CPU in the observability logs. |
| R14 | **Data migration fidelity:** timestamp precision (pg µs → ms), bytea, booleans, FK order, derived columns. | Typed conversion from drizzle metadata (2.12), FK-ordered import, count verification in `import-to-do.mjs`, smoke and manual checks before merge. ms truncation has no business impact. |
| R15 | **Secrets continuity.** Regenerating `BETTER_AUTH_SECRET`, `IP_HASH_SALT` or VAPID keys logs everyone out, breaks IP-hash matching and push. | `copy-app-secrets.ps1` copies the existing values (user step 5). |
| R16 | **better-auth adapter differences on SQLite** (dates, booleans, transactions). | `transaction: false`. Auth flows are covered by `authorization.http.test.ts` (sign-up, sessions) and Playwright login. The adapter is the officially supported `sqlite` provider. |
| R17 | **Single DO throughput** (one thread; roughly 1k simple req/s). | Far above current load (one room, 108 seats). k6 smoke and load in Wave 5. Sharding per room later, if ever needed. |
| R18 | **Storage growth** (10 GB DO limit): `rate_limit_hits`, `security_events`, chat. | Rate-limit pruning (W2-E). Existing retention sweeps kept. `GET /__ops/tables` counts give visibility. |
| R19 | **Backups.** Fly PG backups go away. | DO SQLite has 30-day point-in-time recovery. Plus `ops/backup-do.ps1` NDJSON exports (manual or scheduled locally, like the current Fly backup task). |
| R20 | **CSWSH on the WebSocket.** | Origin allow-list check in `accept` (2.7). Token-based identity. Per-IP and per-socket limits kept. |
| R21 | **Spoofed client IP.** | `cf-connecting-ip` is set by Cloudflare and cannot be forged through the zone route. The Worker passes the original request to the DO unchanged. `workers_dev` (`*.workers.dev`) also sets it. |
| R22 | **Ops endpoint exposure.** | Disabled when the token is empty. Constant-time compare. Not in the Hono app. Remove or rotate the token after migration (user step 9). |
| R23 | **Partly ported tree during Waves 2–3.** | Gates in 0.3, the shim rule, legacy deps kept until W4-B. |
| R24 | **Unread pg-isms in files not inspected by the architect.** The counts in this blueprint are approximate. | `check-port.mjs` patterns (A.2) plus full test suites per group. |

### Assumptions

- The R2 bucket `uns-study-report-evidence` and the zone `saladeestudio.com.ar` belong to the same Cloudflare account `8355b74d76c27ea18e007625360d9cc0`.
- About 30 minutes of planned downtime is acceptable for the cutover.
- No other system reads the Fly Postgres database.
- Today's verifier uses Gemini or Claude with a key that can be reused as a Worker secret.
- The current non-secret production env values are in `fly.toml` `[env]` (W3-B copies them from there).
- No server-side rendering path in `apps/web` calls the API. Verified: only client code uses `apiFetch`. So no service binding from web to API is needed.

### Genuine blockers

None for building. Execution blockers are the user steps in section 5 (plan upgrade, token, secrets, DNS proxied).

---

## Appendix A.1 — Postgres to SQLite rewrite cheatsheet

| Postgres | SQLite / JS |
|---|---|
| `now()` in SQL | bind `new Date()` (typed operators) or `Date.now()` (raw `sql`) |
| `interval '5 minutes'`, `now() - interval …` | compute the Date in JS and bind it |
| `x::int`, `count(*)::int`, `::text`, `::uuid` | drop the cast; `count()` from drizzle; `sql<number>\`…\`.mapWith(Number)` |
| `ILIKE` | `like` (ASCII case-insensitive), or compare a JS-folded column |
| `lower(alias)` / `lower(name)` | `alias_lower` / `name_lower` columns |
| `= ANY(${arr})` | `inArray(col, part)` with `inChunks` |
| `date_trunc`, `AT TIME ZONE`, `extract(epoch …)` | compute boundaries in JS (`date-fns-tz` `fromZonedTime`/`toZonedTime`) and bucket in JS or with integer math on ms |
| `DISTINCT ON (a) … ORDER BY a, b DESC` | subquery with `row_number() over (partition by a order by b desc) = 1`, or JS reduce |
| `GREATEST(a,b)` / `LEAST(a,b)` | `max(a,b)` / `min(a,b)` (scalar) |
| `array_agg(x)` | `json_group_array(x)`, then `JSON.parse`, or group in JS |
| `jsonb` operators (`->`, `->>`, `@>`) | load the column (json mode) and filter in JS, or `json_extract` |
| `FOR UPDATE`, `SKIP LOCKED`, `pg_advisory_xact_lock` | remove; the sync transaction gives isolation |
| `db.execute(sql)` / `.rows` | `db.all(sql)` / `db.get(sql)` / `db.run(sql)`; raw rows are not type-mapped |
| `RETURNING` | supported |
| `ON CONFLICT (…) WHERE … DO UPDATE` | `onConflictDoUpdate({ target, targetWhere, set })` |
| `excluded.col` | `sql\`excluded.col\`` |
| boolean literals `true`/`false` in raw SQL | `1` / `0` |
| `count(*) FILTER (WHERE …)` | supported |
| `NULLS LAST` | supported |
| Date in raw `sql\`${d}\`` | `${d.getTime()}`; read with `new Date(Number(v))` |
| pg error `23505` / constraint name | `isUniqueViolation(err, ["table.column" \| "index_name"])` |

## Appendix A.2 — `check-port.mjs` banned patterns (non-test `.ts` under the given paths)

```
@nestjs/            reflect-metadata     from "express"      from "pg"         @electric-sql/pglite
ioredis             @upstash/            socket\.io          web-push          @aws-sdk/
helmet              transaction\(async   \.for\("update"\)   pg_advisory       SKIP LOCKED
::int  ::text  ::uuid  ::date  ::numeric                     \bILIKE\b         DISTINCT ON
AT TIME ZONE        date_trunc           = ANY\(             (?<![.\w])now\(\) jsonb
fly-client-ip       x-sala-client-ip     PROXY_SHARED_SECRET  fly\.dev         PGLITE
```

Per-file allow comment, for justified false positives only: `// check-port-allow: <pattern> <reason>`.
