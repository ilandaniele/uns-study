import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load the repo-root `.env` (if present) before anything else reads `process.env`.
const apiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(apiDir, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const isProduction = process.env.NODE_ENV === "production";

function ipHashSalt(): string {
  const v = process.env.IP_HASH_SALT ?? "";
  if (!v) {
    // `resolveAppSecrets()` (see `secrets.ts`) resolves/generates this into `process.env` before
    // `env.ts` is ever imported in `main.ts`'s boot path, so this only fires for entry points that
    // skip that step (e.g. a test importing `env.ts` directly without a DB).
    console.warn("[env] IP_HASH_SALT not set — using an insecure dev-only fallback salt.");
    return "dev-salt-change-me";
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  port: num("PORT", 4000),
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgliteDir: process.env.PGLITE_DIR ?? "",
  dbAutoMigrate: bool("DB_AUTO_MIGRATE", process.env.NODE_ENV !== "production"),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  ipHashSalt: ipHashSalt(),
  // Number of reverse-proxy hops in front of the API (Express `trust proxy`), so `req.ip` /
  // `@Ip()` see the real client IP. 1 for a single proxy; 2 on Fly in production, where the
  // chain is browser -> Fly edge -> Next (web app) -> Fly edge -> API, so XFF carries the visitor
  // plus the web app's egress IP. A direct hit on the API can forge that XFF, so with
  // `PROXY_SHARED_SECRET` set, `proxyTrustMiddleware` only honours it when the web app proved itself.
  trustProxyHops: num("TRUST_PROXY_HOPS", 1),
  // Shared with the web app (which adds it as `x-sala-proxy-secret` on its `/api` rewrites). Empty
  // = no check (current behaviour). See `common/proxy-trust.middleware.ts`.
  proxySharedSecret: process.env.PROXY_SHARED_SECRET ?? "",
  // Better Auth cookies default to `SameSite=Lax; Secure` in production, which only works when the
  // web app proxies `/api/auth/*` and `/api/v1/*` to this API (same-origin from the browser's
  // point of view). Set to `true` to restore the old cross-site `SameSite=None; Secure` behaviour
  // (web and API on different domains, no proxy).
  crossSiteCookies: bool("CROSS_SITE_COOKIES", false),
  presenceDevBypass: bool("PRESENCE_DEV_BYPASS", false),
  // E2E-only hooks (e.g. force-expire a check-in). Hard-disabled in production, like the presence bypass.
  e2eTestHooks: !isProduction && bool("E2E_TEST_HOOKS", false),
  presenceMaxAgeS: num("PRESENCE_MAX_AGE_S", 120),
  presenceMaxAccuracyM: num("PRESENCE_MAX_ACCURACY_M", 150),
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2Bucket: process.env.R2_BUCKET_REPORT_EVIDENCE ?? "",
  r2Endpoint: process.env.R2_ENDPOINT ?? "",
  // Seat photo verification (optional external model) — see docs/SEAT_PHOTO_VERIFIER.md.
  seatVerifierUrl: process.env.SEAT_VERIFIER_URL ?? "",
  seatVerifierToken: process.env.SEAT_VERIFIER_TOKEN ?? "",
  seatVerifierMinConfidence: num("SEAT_VERIFIER_MIN_CONFIDENCE", 0.8),
  // "mock" (dev/test only, ignored in production) accepts every photo as the claimed seat.
  seatVerifierMode: process.env.SEAT_VERIFIER_MODE ?? "",
  // Web Push (see `secrets.ts`'s `resolveVapidKeys` — generated + persisted on first boot if unset).
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  // Subscriptions (Mercado Pago) - empty MP_ACCESS_TOKEN = feature disabled.
  mpAccessToken: process.env.MP_ACCESS_TOKEN ?? "",
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET ?? "",
  subscriptionPriceArs: num("SUBSCRIPTION_PRICE_ARS", 1500),
  // Email campaigns (Resend) - empty key/from = feature disabled.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  // Absolute public web URL for email links and the MP back_url; falls back to the first WEB_ORIGIN.
  publicWebUrl: (process.env.PUBLIC_WEB_URL || (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",")[0]!.trim()).replace(/\/$/, ""),
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:contacto@sala-de-estudio.example",
};
