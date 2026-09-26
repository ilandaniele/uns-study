import "reflect-metadata";
import "./env.js"; // loads repo-root .env before anything else reads process.env

import express from "express";
import cors from "cors";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { AppModule } from "./app.module.js";
import { AUTH } from "./auth/auth.tokens.js";
import type { Auth } from "./auth/auth.instance.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { csrfMiddleware } from "./common/csrf.middleware.js";
import { env } from "./env.js";

async function bootstrap() {
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
