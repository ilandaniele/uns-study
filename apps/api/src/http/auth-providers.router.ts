import { Hono } from "hono";
import { env } from "../env.js";
import type { AppEnv } from "./context.js";

export const authProvidersRouter = new Hono<AppEnv>();

/** Public: which sign-in methods are configured, so the web only shows buttons that work. */
authProvidersRouter.get("/auth-providers", (c) =>
  c.json({
    emailPassword: true as const,
    google: Boolean(env.googleClientId && env.googleClientSecret),
    passwordReset: Boolean(env.resendApiKey && env.emailFrom),
    emailVerification: Boolean(env.resendApiKey && env.emailFrom),
    emailOtp: Boolean(env.resendApiKey && env.emailFrom),
    emailVerificationRequired: env.isProduction,
  }),
);
