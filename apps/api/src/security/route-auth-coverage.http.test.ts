import { beforeAll, describe, expect, it } from "vitest";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

/**
 * Routes reachable without a session on purpose. Everything else under /api/v1 must answer 401
 * when called anonymously. Public reads, tightly bounded anonymous counters/forms, and token/signature
 * authenticated endpoints must be declared explicitly with their reason.
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
  "POST /api/v1/usage/section": "anonymous section-open counter; allowlisted enum only, no visitor data, rate limited in memory",
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
  "POST /api/v1/feedback": "anonymous suggestion form; optional auth, Turnstile for anonymous senders, rate limited per user or IP",
  "POST /api/v1/__e2e/expire-checkin": "answers 403 unless E2E_TEST_HOOKS is set, which is forced off in production",
};

const UUID_NONE = "00000000-0000-4000-8000-000000000000";
const PREFIX = "/api/v1";

describe("route auth coverage", () => {
  let app: ReturnType<typeof buildTestApp>["app"];
  let routes: string[] = [];

  beforeAll(() => {
    ({ app } = buildTestApp());
    // `app.routes` lists every registered handler and middleware; middleware entries use method ALL.
    const found = new Set<string>();
    for (const r of app.routes) {
      if (r.method === "ALL" || !r.path.startsWith(`${PREFIX}/`)) continue;
      found.add(`${r.method.toUpperCase()} ${r.path}`);
    }
    routes = [...found].sort();
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
      const res = await app.request(path.replace(/:[A-Za-z]+/g, UUID_NONE), {
        method,
        headers: baseHeaders(["POST", "PUT", "PATCH"].includes(method) ? { "content-type": "application/json" } : {}),
        body: ["POST", "PUT", "PATCH"].includes(method) ? "{}" : undefined,
      });
      // Must be the session guard's 401, not e.g. a bad-signature 401 from a public handler.
      const code = res.status === 401 ? ((await res.json()) as { error?: { code?: string } }).error?.code : undefined;
      if (res.status !== 401 || code !== "UNAUTHENTICATED") offenders.push(`${route} -> ${res.status} ${code ?? ""}`.trim());
    }
    expect(offenders).toEqual([]);
  }, 120_000);

  it("only lists public routes that exist", () => {
    const stale = Object.keys(PUBLIC_ROUTES).filter((r) => !routes.includes(r));
    expect(stale).toEqual([]);
  });
});
