import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { ResendClient } from "../email/resend.client.js";
import { createPasswordResetSender } from "./password-reset-email.js";
import { createEmailCodeSender, EMAIL_CODE_SECONDS } from "./email-otp.js";
import { hasEmailOwnership } from "./email-ownership.js";

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
  const sendEmailCode = createEmailCodeSender(
    env.resendApiKey && env.emailFrom ? new ResendClient(env.resendApiKey) : null,
    env.emailFrom,
  );
  // Better Auth deliberately catches delivery callback failures. Keep their result request-local
  // so the UI can offer a retry rather than claiming the message was sent.
  const deliveryFailures = new WeakSet<object>();

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
    // Missing/expired state cannot always recover the per-attempt return URL (old tabs included).
    onAPIError: { errorURL: new URL("/login?oauth=google", env.publicWebUrl).href },
    emailAndPassword: {
      enabled: true,
      // Deployed sign-up is code-first: the user row is only created after mailbox proof.
      disableSignUp: env.isProduction,
      requireEmailVerification: env.isProduction,
      revokeSessionsOnPasswordReset: true,
      ...(sendResetPassword ? { sendResetPassword, resetPasswordTokenExpiresIn: 60 * 60 } : {}),
    },
    plugins: [emailOTP({ sendVerificationOTP: async (data, ctx) => {
      try { await sendEmailCode(data); }
      catch (error) { if (ctx) deliveryFailures.add(ctx.context); throw error; }
    }, otpLength: 6, expiresIn: EMAIL_CODE_SECONDS,
      allowedAttempts: 5, storeOTP: "hashed", resendStrategy: "rotate" })],
    hooks: { before: createAuthMiddleware(async (ctx) => {
      // OTP sign-in safely strips unproven credentials and old sessions before verifying legacy
      // accounts. The separate verification endpoint would leave a squatter's password active.
      const path = ctx.path?.replace(/\/+$/, "");
      if (path === "/email-otp/send-verification-otp" && (!env.resendApiKey || !env.emailFrom)) {
        throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_UNAVAILABLE", message: "El envío de códigos no está disponible en este momento." });
      }
      if (path === "/verify-email" || path === "/send-verification-email" ||
          (path === "/email-otp/send-verification-otp" && ctx.body?.type !== "sign-in") ||
          (path?.startsWith("/email-otp/") && path !== "/email-otp/send-verification-otp")) {
        throw new APIError("FORBIDDEN", { code: "EMAIL_CODE_REQUIRED", message: "Ingresá con el código enviado a tu email para verificar tu cuenta." });
      }
    }), after: createAuthMiddleware(async (ctx) => {
      if (deliveryFailures.delete(ctx.context)) throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_DELIVERY_FAILED", message: "No pudimos enviar el código. Esperá un momento y volvé a pedirlo." });
    }) },
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
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 10 },
      },
    },
    // Signed cookie cache: most requests skip the session+user DB lookup. Bans/restrictions are
    // enforced from the restrictions table (not the session), so the 60 s staleness is harmless.
    // Read canonical sessions on every request: deletion/revocation must take effect immediately.
    session: { cookieCache: { enabled: false } },
    // A banned user must not be able to log in again (`requireAuth` also rejects their requests).
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [user] = await db.select({ emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, session.userId)).limit(1);
            if (!hasEmailOwnership(user)) throw new APIError("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED", message: "Confirmá el código enviado a tu email antes de ingresar." });
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
