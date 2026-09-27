import "reflect-metadata";

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { closeDb, createDb, migrate } from "@uns/database";
import { resolveAppSecrets } from "./secrets.js";

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
  const secretsDb = createDb({
    databaseUrl: process.env.DATABASE_URL || undefined,
    pgliteDir: process.env.PGLITE_DIR || undefined,
  });
  const dbAutoMigrate = process.env.DB_AUTO_MIGRATE
    ? process.env.DB_AUTO_MIGRATE === "true" || process.env.DB_AUTO_MIGRATE === "1"
    : process.env.NODE_ENV !== "production";
  if (dbAutoMigrate) await migrate(secretsDb);
  await resolveAppSecrets(secretsDb);
  await closeDb(secretsDb);

  // Safe to import anything that reads `env.ts` from here on.
  const { NestFactory } = await import("@nestjs/core");
  const { toNodeHandler } = await import("better-auth/node");
  const { AppModule } = await import("./app.module.js");
  const { AUTH } = await import("./auth/auth.tokens.js");
  const { ApiExceptionFilter } = await import("./common/api-exception.filter.js");
  const { csrfMiddleware } = await import("./common/csrf.middleware.js");
  const { env } = await import("./env.js");
  type Auth = import("./auth/auth.instance.js").Auth;

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks(); // closes the DB (and releases the PGlite lock) on SIGINT/SIGTERM

  // CORS must be registered before the Better Auth handler so its routes/preflight get headers too.
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set("trust proxy", env.trustProxyHops); // behind a reverse proxy — @Ip() must see the real client IP
  httpAdapter.use(cors({ origin: env.webOrigins, credentials: true }));

  // CSRF guard for state-changing /api/v1 requests. Better Auth's own routes (/api/auth/*)
  // already validate `trustedOrigins`, so this only needs to cover Nest's routes.
  httpAdapter.use(csrfMiddleware(env.webOrigins));

  // Better Auth owns its own body parsing; it must run before Nest's global JSON body parser.
  const auth = app.get<Auth>(AUTH);
  httpAdapter.all("/api/auth/*", toNodeHandler(auth));
  app.use(express.json());

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(env.port);
  console.log(`[api] listening on :${env.port} (prefix /api/v1)`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
