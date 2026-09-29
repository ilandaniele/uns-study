import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { env } from "../env.js";

export type Auth = ReturnType<typeof buildAuth>;

/** Builds the Better Auth instance against the shared Drizzle db. Called once at boot. */
export function buildAuth(db: Db) {
  if (!env.betterAuthSecret) {
    // `resolveAppSecrets()` (see `secrets.ts`) resolves/generates this into `process.env` before
    // `env.ts` is ever imported in `main.ts`'s boot path, so this only fires for entry points that
    // skip that step (e.g. a test building `Auth` directly without a DB).
    console.warn("[auth] BETTER_AUTH_SECRET not set — using an insecure dev-only fallback secret.");
  }

  const useGoogle = Boolean(env.googleClientId && env.googleClientSecret);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret || "dev-only-insecure-secret-change-me",
    trustedOrigins: env.webOrigins,
    emailAndPassword: { enabled: true },
    socialProviders: useGoogle
      ? { google: { clientId: env.googleClientId, clientSecret: env.googleClientSecret } }
      : undefined,
    // In production the web app proxies /api/auth + /api/v1 to this API (see apps/web/next.config.ts
    // + API_PROXY_TARGET), so the session cookie is first-party from the browser's point of view —
    // `Lax` is enough and avoids Safari/iOS blocking third-party `SameSite=None` cookies. Set
    // CROSS_SITE_COOKIES=true to fall back to the old cross-site behaviour when web/API aren't proxied.
    advanced: env.isProduction
      ? {
          defaultCookieAttributes: env.crossSiteCookies
            ? { sameSite: "none", secure: true }
            : { sameSite: "lax", secure: true },
          // main.ts copies Express's proxy-resolved client IP into this header right before the
          // Better Auth handler (any client-sent value is overwritten), so rate limits are per
          // visitor instead of one bucket shared by everyone.
          ipAddress: { ipAddressHeaders: ["x-uns-client-ip"] },
        }
      : undefined,
  });
}
