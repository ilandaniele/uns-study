function bool(src: Record<string, string | undefined>, name: string, fallback: boolean): boolean {
  const v = src[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

function num(src: Record<string, string | undefined>, name: string, fallback: number): number {
  const v = src[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ipHashSalt(src: Record<string, string | undefined>): string {
  const v = src.IP_HASH_SALT ?? "";
  if (!v) {
    console.warn("[env] IP_HASH_SALT not set — using an insecure dev-only fallback salt.");
    return "dev-salt-change-me";
  }
  return v;
}

/** Pure: builds the config from a flat string map (`process.env`, Worker bindings, or a test fixture). */
export function loadEnv(src: Record<string, string | undefined>) {
  const isProduction = src.NODE_ENV === "production";
  const webOriginsRaw = src.WEB_ORIGINS || "http://localhost:3000";
  const webOrigins = webOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    isProduction,
    webOrigins,
    betterAuthSecret: src.BETTER_AUTH_SECRET ?? "",
    betterAuthUrl: src.BETTER_AUTH_URL ?? "http://localhost:4000",
    googleClientId: src.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: src.GOOGLE_CLIENT_SECRET ?? "",
    ipHashSalt: ipHashSalt(src),
    // Better Auth cookies default to `SameSite=Lax; Secure` in production, which only works when the
    // web app and the API share an origin (the zone routes `/api/*` to the API Worker). Set to `true`
    // to restore the cross-site `SameSite=None; Secure` behaviour (web and API on different domains).
    crossSiteCookies: bool(src, "CROSS_SITE_COOKIES", false),
    presenceDevBypass: bool(src, "PRESENCE_DEV_BYPASS", false),
    // E2E-only hooks (e.g. force-expire a check-in). Hard-disabled in production, like the presence bypass.
    e2eTestHooks: !isProduction && bool(src, "E2E_TEST_HOOKS", false),
    presenceMaxAgeS: num(src, "PRESENCE_MAX_AGE_S", 120),
    presenceMaxAccuracyM: num(src, "PRESENCE_MAX_ACCURACY_M", 150),
    turnstileSecretKey: src.TURNSTILE_SECRET_KEY ?? "",
    adminEmails: (src.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    ownerEmail: (src.OWNER_EMAIL ?? "ilan.daniele@gmail.com").trim().toLowerCase(),
    r2AccountId: src.R2_ACCOUNT_ID ?? "",
    r2AccessKeyId: src.R2_ACCESS_KEY_ID ?? "",
    r2SecretAccessKey: src.R2_SECRET_ACCESS_KEY ?? "",
    r2Bucket: src.R2_BUCKET || "",
    // True when the `EVIDENCE` R2 binding exists (set by `initEnv`, which sees the bindings).
    r2Binding: false,
    // Seat photo verification — see docs/SEAT_PHOTO_VERIFIER.md.
    seatVerifierMinConfidence: num(src, "SEAT_VERIFIER_MIN_CONFIDENCE", 0.8),
    // "mock" (dev/test only, ignored in production) accepts every photo as the claimed seat.
    seatVerifierMode: src.SEAT_VERIFIER_MODE ?? "",
    // In-process locator models (folded-in verifier). Empty key = that provider is unavailable.
    geminiApiKey: src.GEMINI_API_KEY ?? "",
    anthropicApiKey: src.ANTHROPIC_API_KEY ?? "",
    verifierModel: src.VERIFIER_MODEL ?? "",
    vapidPublicKey: src.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: src.VAPID_PRIVATE_KEY ?? "",
    // Subscriptions (Mercado Pago) - empty MP_ACCESS_TOKEN = feature disabled.
    mpAccessToken: src.MP_ACCESS_TOKEN ?? "",
    mpWebhookSecret: src.MP_WEBHOOK_SECRET ?? "",
    subscriptionPriceArs: num(src, "SUBSCRIPTION_PRICE_ARS", 1500),
    // Email campaigns (Resend) - empty key/from = feature disabled.
    resendApiKey: src.RESEND_API_KEY ?? "",
    emailFrom: src.EMAIL_FROM ?? "",
    // Absolute public web URL for email links and the MP back_url; falls back to the first web origin.
    publicWebUrl: (src.PUBLIC_WEB_URL || webOrigins[0] || "http://localhost:3000").replace(/\/$/, ""),
    vapidSubject: src.VAPID_SUBJECT || "mailto:contacto@sala-de-estudio.example",
    // Token that gates `/api/v1/__ops/*` (data migration import/export). Empty = disabled.
    opsImportToken: src.OPS_IMPORT_TOKEN ?? "",
    maintenanceMode: src.MAINTENANCE_MODE === "1",
  };
}

export type Env = ReturnType<typeof loadEnv>;

/** Mutable singleton: `initEnv` rewrites it in place so every importer sees the Worker bindings. */
export const env: Env = loadEnv(process.env);

/**
 * Called first thing in the `AppDO` constructor: copies the string bindings (vars and secrets)
 * into `process.env`, then refreshes the singleton.
 */
export function initEnv(bindings: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(bindings)) {
    if (typeof value === "string") process.env[name] = value;
  }
  Object.assign(env, loadEnv(process.env), { r2Binding: bindings.EVIDENCE != null });
}
