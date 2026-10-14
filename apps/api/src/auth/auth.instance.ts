import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { ResendClient } from "../email/resend.client.js";
import { createPasswordResetSender } from "./password-reset-email.js";
import { createVerificationEmailSender } from "./verification-email.js";

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
    // The Worker secret `BETTER_AUTH_SECRET` is always set in production; this only fires for
    // tests and local runs that build `Auth` without it.
    if (env.isProduction) throw new Error("BETTER_AUTH_SECRET is not set; refusing to start with an insecure fallback secret in production.");
    console.warn("[auth] BETTER_AUTH_SECRET not set — using an insecure dev-only fallback secret.");
  }

  const useGoogle = Boolean(env.googleClientId && env.googleClientSecret);
  // Null (reset disabled) unless Resend is configured.
  const sendResetPassword = createPasswordResetSender(
    env.resendApiKey && env.emailFrom ? new ResendClient(env.resendApiKey) : null,
    { from: env.emailFrom, webUrl: env.publicWebUrl },
  );
  // Same gating as reset. Not `requireEmailVerification`: existing unverified users keep signing in.
  const sendVerificationEmail = createVerificationEmailSender(
    env.resendApiKey && env.emailFrom ? new ResendClient(env.resendApiKey) : null,
    { from: env.emailFrom },
  );

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
      // The Durable Object SQLite driver is synchronous: no async transaction callbacks.
      transaction: false,
    }),
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret || "dev-only-insecure-secret-change-me",
    trustedOrigins: env.webOrigins,
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      ...(sendResetPassword ? { sendResetPassword, resetPasswordTokenExpiresIn: 60 * 60 } : {}),
    },
    ...(sendVerificationEmail
      ? {
          emailVerification: {
            sendVerificationEmail,
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            expiresIn: 60 * 60 * 24,
          },
        }
      : {}),
    // In-memory per-instance limiter: a cheap first layer. The per-email/IP layer (SQLite-backed) is
    // `authRateLimit`, mounted before this handler in `createApp`.
    rateLimit: {
      enabled: env.isProduction,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    // Signed cookie cache: most requests skip the session+user DB lookup. Bans/restrictions are
    // enforced from the restrictions table (not the session), so the 60 s staleness is harmless.
    session: { cookieCache: { enabled: true, maxAge: 60 } },
    // A banned user must not be able to log in again (`requireAuth` also rejects their requests).
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
    // In production the Cloudflare zone routes /api/* to this Worker on the same host as the web app,
    // so the session cookie is first-party — `Lax` is enough and avoids Safari/iOS blocking
    // third-party `SameSite=None` cookies. Set CROSS_SITE_COOKIES=true for a cross-site deployment.
    advanced: {
      // Cloudflare sets this header at the edge (a client-sent value is overwritten), so rate
      // limits are per visitor instead of one bucket shared by everyone.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      ...(env.isProduction
        ? { defaultCookieAttributes: env.crossSiteCookies ? { sameSite: "none" as const, secure: true } : { sameSite: "lax" as const, secure: true } }
        : {}),
    },
  });
}
