import "reflect-metadata";

import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { seedInitialRoom } from "@sala/database";

// Must run before `env.ts` is first evaluated (it captures process.env at import time): an
// in-memory PGlite, no Redis/Resend, and no real DATABASE_URL leaking in from a local `.env`.
vi.hoisted(() => {
  process.env.DATABASE_URL = "";
  process.env.PGLITE_DIR = "memory://";
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  process.env.REDIS_URL = "";
  process.env.RESEND_API_KEY = "";
  process.env.EMAIL_FROM = "";
  process.env.MIGRATION_DATABASE_URL = "";
  process.env.E2E_TEST_HOOKS = "";
});

/**
 * Routes reachable without a session on purpose. Everything else under /api/v1 must answer 401
 * when called anonymously. Add an entry here only for read-only public data or token/signature
 * authenticated endpoints, and say why.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  "GET /api/v1/health": "liveness probe",
  "GET /api/v1/health/ready": "readiness probe",
  "GET /api/v1/auth-providers": "tells the login page which providers are configured",
  "GET /api/v1/verification/status": "feature flag only, no user data",
  "GET /api/v1/notifications/vapid-public-key": "VAPID public key is public by design",
  "GET /api/v1/me": "optional auth: returns the anonymous state when there is no session",
  "GET /api/v1/rooms": "public room list",
  "GET /api/v1/rooms/:idOrSlug": "public room data",
  "GET /api/v1/rooms/:idOrSlug/map": "public seat map and state",
  "POST /api/v1/rooms/:idOrSlug/visits": "anonymous visit counter; stores only a salted hash, rate limited",
  "GET /api/v1/rooms/:idOrSlug/stats/today": "public visitor count, own contribution count only when signed in",
  "GET /api/v1/rooms/:idOrSlug/announcements": "public banner copy",
  "GET /api/v1/rooms/:idOrSlug/rankings": "public rankings, own row only when signed in",
  "GET /api/v1/rooms/:idOrSlug/disputes": "public read-only dispute list (optional auth)",
  "GET /api/v1/disputes/:id": "public read-only dispute view (optional auth)",
  "GET /api/v1/tables/:tableId/names": "public table-name proposals (optional auth)",
  "GET /api/v1/avatars/:userId": "public avatar image; hidden users return not found",
  "GET /api/v1/qr/:token": "public QR resolve for the /q/[token] redirect page, rate limited",
  "GET /api/v1/email/unsubscribe": "token-authenticated unsubscribe status",
  "POST /api/v1/email/unsubscribe": "token-authenticated RFC 8058 one-click unsubscribe",
  "POST /api/v1/webhooks/mercadopago": "authenticated by Mercado Pago signature, not session",
  "POST /api/v1/donations/checkout": "anonymous one-time donation; bounded amount, rate limited per IP, stores nothing",
  "POST /api/v1/__e2e/expire-checkin": "only mounted with E2E_TEST_HOOKS, never in production",
};

const ORIGIN = "http://localhost:3000";
const UUID_NONE = "00000000-0000-4000-8000-000000000000";
const PREFIX = "/api/v1";

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe("route auth coverage", () => {
  let app: INestApplication;
  let base: string;
  let routes: string[] = [];

  beforeAll(async () => {
    const { NestFactory } = await import("@nestjs/core");
    const { toNodeHandler } = await import("better-auth/node");
    const { AppModule } = await import("../app.module.js");
    const { AUTH } = await import("../auth/auth.tokens.js");
    const { DB } = await import("../database/database.module.js");
    const { ApiExceptionFilter } = await import("../common/api-exception.filter.js");

    app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
    const http = app.getHttpAdapter().getInstance();
    http.all("/api/auth/*splat", toNodeHandler(app.get(AUTH)));
    app.use(express.json());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    await seedInitialRoom(app.get(DB));

    const stack = ((http as { router?: { stack: RouteLayer[] } }).router?.stack ?? []) as RouteLayer[];
    const found = new Set<string>();
    for (const layer of stack) {
      if (!layer.route || !layer.route.path.startsWith(`${PREFIX}/`)) continue;
      for (const [method, on] of Object.entries(layer.route.methods)) {
        if (on) found.add(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }
    routes = [...found].sort();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("enumerates the registered routes", () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(routes).toContain("GET /api/v1/profiles/me");
    expect(routes).toContain("POST /api/v1/checkins");
    expect(routes).toContain("GET /api/v1/admin/users");
  });

  it("answers 401 to anonymous requests on every route not declared public", async () => {
    const offenders: string[] = [];
    for (const route of routes) {
      if (route in PUBLIC_ROUTES) continue;
      const [method, path] = route.split(" ") as [string, string];
      const res = await fetch(`${base}${path.replace(/:[A-Za-z]+/g, UUID_NONE)}`, {
        method,
        headers: {
          origin: ORIGIN,
          ...(["POST", "PUT", "PATCH"].includes(method) ? { "content-type": "application/json" } : {}),
        },
        body: ["POST", "PUT", "PATCH"].includes(method) ? "{}" : undefined,
      });
      // Must be the session guard's 401, not e.g. a bad-signature 401 from a public handler.
      const code = res.status === 401 ? ((await res.json()) as { error?: { code?: string } }).error?.code : undefined;
      if (res.status !== 401 || code !== "UNAUTHENTICATED") offenders.push(`${route} -> ${res.status} ${code ?? ""}`.trim());
    }
    expect(offenders).toEqual([]);
  }, 120_000);

  it("only lists public routes that exist", () => {
    // The e2e hook controller is only mounted when E2E_TEST_HOOKS is set.
    const stale = Object.keys(PUBLIC_ROUTES).filter((r) => !routes.includes(r) && !r.includes("/__e2e/"));
    expect(stale).toEqual([]);
  });
});
