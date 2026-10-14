import { Hono } from "hono";
import type { AppEnv } from "../http/context.js";
import { currentUser } from "../http/context.js";
import { requireAuth } from "../http/guards.js";
import { signSocketToken } from "./socket-token.js";

/** Issues short-lived realtime auth tokens for the current session. The socket may connect straight
 *  to the API host, where the Better Auth session cookie isn't readable, so it presents this token. */
export const realtimeTokenRouter = new Hono<AppEnv>();

realtimeTokenRouter.get("/realtime/token", requireAuth(), (c) => {
  const user = currentUser(c);
  // requireAuth always sets sessionId; the guard is the only way into this handler.
  return c.json(signSocketToken(user.id, user.sessionId ?? ""));
});
