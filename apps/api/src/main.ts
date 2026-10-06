import "reflect-metadata";

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { assertMigrationsApplied, closeDb, createDb, migrate, seedInitialRoom } from "@sala/database";
import { resolveAppSecrets, resolveVapidKeys } from "./secrets.js";

// Load the repo-root `.env` (if present) before anything else reads `process.env` — duplicated
// from `env.ts` here because `env.ts` must not be imported until *after* `resolveAppSecrets()`
// below has had a chance to fill in `BETTER_AUTH_SECRET` / `IP_HASH_SALT` (it captures them into
// plain fields at module-evaluation time).
const apiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(apiDir, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

async function bootstrap() {
  // Resolve (or generate + persist) BETTER_AUTH_SECRET / IP_HASH_SALT before any other module
  // reads them, so the API never needs hand-typed generated secrets in deployment. Uses a
  // short-lived db connection of its own since `./database/database.module.js` (and everything
  // that depends on `env.ts`) can't be imported yet.
  // MIGRATION_DATABASE_URL (owner role) is only meant for local/one-off use: in production the
  // runtime machine holds just DATABASE_URL (least-privilege role) and migrations are applied from
  // outside with ops/migrate-fly-db.ps1. Without it the boot never runs DDL; it checks that the
  // schema is up to date and fails (so Fly keeps the previous version) if it is not. Seed and
  // secrets only do DML, which the runtime role is allowed to.
  const ownerUrl = process.env.MIGRATION_DATABASE_URL || "";
  const secretsDb = createDb({
    databaseUrl: ownerUrl || process.env.DATABASE_URL || undefined,
    pgliteDir: process.env.PGLITE_DIR || undefined,
  });
  const dbAutoMigrate = process.env.DB_AUTO_MIGRATE
    ? process.env.DB_AUTO_MIGRATE === "true" || process.env.DB_AUTO_MIGRATE === "1"
    : process.env.NODE_ENV !== "production";
  if (dbAutoMigrate) await migrate(secretsDb);
  else if (process.env.NODE_ENV === "production" && !ownerUrl) await assertMigrationsApplied(secretsDb);
  // Production (Fly) sets BOOT_MIGRATE_SEED=true: the idempotent seed runs in-process here (and the
  // migration too when an owner URL is present), replacing the `tsx` child processes the container
  // used to spawn before every boot.
  if (process.env.BOOT_MIGRATE_SEED === "true") {
    if (!dbAutoMigrate && (ownerUrl || process.env.NODE_ENV !== "production")) await migrate(secretsDb);
    await seedInitialRoom(secretsDb);
  }
  await resolveAppSecrets(secretsDb);
  await resolveVapidKeys(secretsDb);
  await closeDb(secretsDb);

  // Safe to import anything that reads `env.ts` from here on.
  const { NestFactory } = await import("@nestjs/core");
  const { toNodeHandler } = await import("better-auth/node");
  const { AppModule } = await import("./app.module.js");
  const { AUTH } = await import("./auth/auth.tokens.js");
  const { ApiExceptionFilter } = await import("./common/api-exception.filter.js");
  const { csrfMiddleware } = await import("./common/csrf.middleware.js");
  const { authRateLimitMiddleware } = await import("./common/auth-rate-limit.middleware.js");
  const { globalIpRateLimitMiddleware } = await import("./common/global-ip-rate-limit.middleware.js");
  const { proxyTrustMiddleware } = await import("./common/proxy-trust.middleware.js");
  const { RateLimitService } = await import("./security/rate-limit.service.js");
  const { env } = await import("./env.js");
  type Auth = import("./auth/auth.instance.js").Auth;

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks(); // closes the DB (and releases the PGlite lock) on SIGINT/SIGTERM

  // CORS must be registered before the Better Auth handler so its routes/preflight get headers too.
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set("trust proxy", env.trustProxyHops); // behind a reverse proxy — @Ip() must see the real client IP
  // First of all, before anything reads `req.ip`: a direct hit on the API could forge X-Forwarded-For,
  // so unless the web app's shared secret is present the header is swapped for Fly-Client-IP.
  httpAdapter.use(proxyTrustMiddleware(env.proxySharedSecret));
  // Coarse per-IP cap (300/min) over every /api/v1 route; health and the MP webhook are skipped.
  httpAdapter.use("/api/v1", globalIpRateLimitMiddleware());
  httpAdapter.use(cors({ origin: env.webOrigins, credentials: true }));
  // Security headers for a JSON/image/Socket.IO API (no HTML). The browser only sees avatars
  // through the web app's same-origin `/api/v1` proxy, so CORP stays same-site. Helmet also drops
  // `X-Powered-By`; the avatar controller sets its own CSP/nosniff afterwards, which wins.
  httpAdapter.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );

  // Coordinate-free access log for slow or failed requests only, to diagnose "la app tarda" reports
  // from `fly logs` without logging every hit. Ids in the path are masked; no query strings, no IPs.
  httpAdapter.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (ms < 800 && res.statusCode < 500) return;
      const path = req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9]{24,}/g, ":id");
      console.info(JSON.stringify({ evt: "slow_or_failed_request", method: req.method, path, status: res.statusCode, ms: Math.round(ms) }));
    });
    next();
  });

  // CSRF guard for state-changing /api/v1 requests. Better Auth's own routes (/api/auth/*)
  // already validate `trustedOrigins`, so this only needs to cover Nest's routes.
  httpAdapter.use(csrfMiddleware(env.webOrigins));

  // Better Auth owns its own body parsing; it must run before Nest's global JSON body parser.
  const auth = app.get<Auth>(AUTH);
  // Better Auth only trusts a single-entry X-Forwarded-For, but ours carries the visitor plus
  // the web app's egress IP (Fly appends it). Hand it the IP Express already resolved with
  // `trust proxy` (the same one @Ip() and our own rate limits use) in a header only we set.
  httpAdapter.use("/api/auth", (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.headers["x-sala-client-ip"] = req.ip ?? "";
    next();
  });
  // Per-email + Fly-Client-IP limits on email sign-in/sign-up (defense in depth: `req.ip` is only trustworthy when `PROXY_SHARED_SECRET` is set; see `proxyTrustMiddleware`).
  httpAdapter.use("/api/auth", authRateLimitMiddleware(app.get(RateLimitService), { trustReqIp: Boolean(env.proxySharedSecret) }));
  httpAdapter.all("/api/auth/*", toNodeHandler(auth));

  // The photo-verification body carries a base64 image (~2MB decoded, larger encoded) — give just
  // that route a bigger JSON limit before the global parser below (which body-parser then skips,
  // since it only re-parses a request whose body hasn't already been consumed). Only requests that
  // carry a Better Auth session cookie get the bigger limit — an unauthenticated caller can't reach
  // AuthGuard-protected handlers anyway, so there's no reason to let it push multi-MB bodies through
  // Express's body parser first. Anything without the cookie falls through to the default (100kb)
  // parser below, which rejects it long before it reaches a controller.
  const PHOTO_ROUTE = /^\/api\/v1\/checkins\/[^/]+\/photo$/;
  const photoJsonParser = express.json({ limit: "3mb" });
  // The avatar upload body carries a base64 image (≤300KB decoded, ~420KB encoded) — same idea,
  // smaller limit.
  const AVATAR_ROUTE = /^\/api\/v1\/profiles\/me\/avatar$/;
  const avatarJsonParser = express.json({ limit: "1mb" });
  httpAdapter.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === "POST" && hasSessionCookie(req) && PHOTO_ROUTE.test(req.path)) return photoJsonParser(req, res, next);
    if (req.method === "POST" && hasSessionCookie(req) && AVATAR_ROUTE.test(req.path)) return avatarJsonParser(req, res, next);
    next();
  });
  app.use(express.json());

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(env.port);
  console.log(`[api] listening on :${env.port} (prefix /api/v1)`);
}

// Better Auth's default cookie name (see auth.instance.ts — cookiePrefix isn't overridden), with
// its optional `__Secure-` prefix (added automatically once the cookie is `secure`, i.e. in
// production or over an https baseURL — see better-auth's `createCookieGetter`). A raw substring
// check on the `Cookie` header is enough here: we only need "is this caller plausibly
// authenticated", not a parsed value — AuthGuard does the real verification downstream.
const SESSION_COOKIE_RE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;
function hasSessionCookie(req: express.Request): boolean {
  const header = req.headers.cookie;
  return typeof header === "string" && SESSION_COOKIE_RE.test(header);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
