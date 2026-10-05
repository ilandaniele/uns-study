import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { ResendClient } from "../email/resend.client.js";
import { createPasswordResetSender } from "./password-reset-email.js";

export type Auth = ReturnType<typeof buildAuth>;

/** True when `userId` has an active (unlifted, unexpired) BANNED restriction. */
export async function hasActiveBan(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.userRestrictions.id })
    .from(schema.userRestrictions)
    .where(
      and(
        eq(schema.userRestrictions.userId, userId),
        eq(schema.userRestrictions.type, "BANNED"),
        isNull(schema.userRestrictions.liftedAt),
        or(isNull(schema.userRestrictions.until), gt(schema.userRestrictions.until, new Date())),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Builds the Better Auth instance against the shared Drizzle db. Called once at boot. */
export function buildAuth(db: Db) {
  if (!env.betterAuthSecret) {
    // `resolveAppSecrets()` (see `secrets.ts`) resolves/generates this into `process.env` before
    // `env.ts` is ever imported in `main.ts`'s boot path, so this only fires for entry points that
    // skip that step (e.g. a test building `Auth` directly without a DB).
    if (env.isProduction) throw new Error("BETTER_AUTH_SECRET is not set; refusing to start with an insecure fallback secret in production.");
    console.warn("[auth] BETTER_AUTH_SECRET not set — using an insecure dev-only fallback secret.");
  }

  const useGoogle = Boolean(env.googleClientId && env.googleClientSecret);
  // Null (reset disabled) unless Resend is configured.
  const sendResetPassword = createPasswordResetSender(
    env.resendApiKey && env.emailFrom ? new ResendClient(env.resendApiKey) : null,
    { from: env.emailFrom, webUrl: env.publicWebUrl },
  );

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret || "dev-only-insecure-secret-change-me",
    trustedOrigins: env.webOrigins,
    emailAndPassword: {
      enabled: true,
      ...(sendResetPassword ? { sendResetPassword, resetPasswordTokenExpiresIn: 60 * 60 } : {}),
    },
    // In-memory per-instance limiter: a cheap first layer. The distributed (Upstash-backed) layer is
    // `authRateLimitMiddleware`, mounted before this handler in main.ts.
    rateLimit: {
      enabled: env.isProduction,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    // Signed cookie cache: most requests skip the session+user DB lookup. Bans/restrictions are
    // enforced from the restrictions table (not the session), so the 60 s staleness is harmless.
    session: { cookieCache: { enabled: true, maxAge: 60 } },
    // A banned user must not be able to log in again (AuthGuard also rejects their requests).
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (await hasActiveBan(db, session.userId)) {
              throw new APIError("FORBIDDEN", { message: "Tu cuenta está suspendida.", code: "ACCOUNT_BANNED" });
            }
          },
        },
      },
    },
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
          ipAddress: { ipAddressHeaders: ["x-sala-client-ip"] },
        }
      : undefined,
  });
}
