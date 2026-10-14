import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { toErrorResponse } from "../../common/api-error.js";
import type { AppEnv } from "../context.js";

const DEFAULT_LIMIT = 100 * 1024;
const PHOTO_LIMIT = 3 * 1024 * 1024;
const AVATAR_LIMIT = 1024 * 1024;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// The photo-verification body carries a base64 image (~2MB decoded, larger encoded).
const PHOTO_ROUTE = /^\/api\/v1\/checkins\/[^/]+\/photo$/;
// The avatar upload body carries a base64 image (<=300KB decoded, ~420KB encoded).
const AVATAR_ROUTE = /^\/api\/v1\/profiles\/me\/avatar$/;
// Better Auth's default cookie name, with its optional `__Secure-` prefix. A raw match on the
// `Cookie` header is only a cheap pre-filter; `hasLiveSession` does the real verification.
const SESSION_COOKIE_RE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

function payloadTooLarge(): HTTPException {
  return new HTTPException(413, { message: "Payload Too Large" });
}

/**
 * Reads `req`'s body as text through a clone, so the original stays readable. Streams and aborts
 * as soon as `maxBytes` is exceeded (413), so a chunked upload without Content-Length can't buffer more.
 */
export async function readTextLimited(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge();
  const body = req.clone().body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // A tee branch's cancel() settles only once the other branch cancels too: do not await it.
      void reader.cancel().catch(() => undefined);
      throw payloadTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function hasLiveSession(c: Context<AppEnv>): Promise<boolean> {
  const cookie = c.req.header("cookie");
  if (!cookie || !SESSION_COOKIE_RE.test(cookie)) return false;
  try {
    return Boolean((await c.var.auth.api.getSession({ headers: c.req.raw.headers }))?.session);
  } catch {
    return false;
  }
}

async function limitFor(c: Context<AppEnv>): Promise<number> {
  if (c.req.method !== "POST") return DEFAULT_LIMIT;
  const bigger = PHOTO_ROUTE.test(c.req.path) ? PHOTO_LIMIT : AVATAR_ROUTE.test(c.req.path) ? AVATAR_LIMIT : 0;
  // Only requests with a live session get a bigger limit: a forged or signed-out cookie can't push
  // multi-MB bodies through. Everything else falls to the default, long before a handler runs.
  if (bigger && (await hasLiveSession(c))) return bigger;
  return DEFAULT_LIMIT;
}

/** Caps request bodies on `/api/v1`: 100 KB by default, 3 MB for check-in photos and 1 MB for avatars (live session only). */
export function bodyLimits(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!BODY_METHODS.has(c.req.method)) return next();
    const maxSize = await limitFor(c);
    return bodyLimit({
      maxSize,
      onError: (ctx) => {
        const r = toErrorResponse(payloadTooLarge(), { method: ctx.req.method, path: ctx.req.path });
        return ctx.json(r.body, r.status as never);
      },
    })(c, next);
  };
}
