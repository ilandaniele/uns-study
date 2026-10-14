import type { Context } from "hono";
import type { Auth } from "../auth/auth.instance.js";
import { ApiErrors } from "../common/api-error.js";
import type { Services } from "../services.js";

export interface RequestUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified?: boolean;
  /** Better Auth session id behind this request (set by `requireAuth`). */
  sessionId?: string;
}

export type AppEnv = {
  Variables: {
    services: Services;
    auth: Auth;
    /** `cf-connecting-ip`, else "127.0.0.1". */
    ip: string;
    /** Set by the guards; null when anonymous. */
    user: RequestUser | null;
  };
};

export function currentUser(c: Context<AppEnv>): RequestUser {
  const user = c.get("user");
  if (!user) throw ApiErrors.unauthenticated();
  return user;
}
