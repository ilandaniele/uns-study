import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { API_URL } from "./api";

/**
 * `baseURL` is only passed when `NEXT_PUBLIC_API_URL` is set (local dev, pointing straight at the
 * API). Left `undefined` in production, Better Auth's client defaults to a same-origin `/api/auth`
 * — the web app proxies that path to the API (see `next.config.ts`), keeping the session cookie
 * first-party.
 */
export const authClient = createAuthClient({
  baseURL: API_URL || undefined,
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
