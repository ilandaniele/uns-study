import { Hono } from "hono";
import { uploadAvatarSchema } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";
import { currentUser, type AppEnv } from "../http/context.js";
import { optionalAuth, requireAuth } from "../http/guards.js";
import { reply } from "../http/reply.js";
import { zBody } from "../http/validate.js";
import { hashIp } from "../security/security-event.service.js";

// Shared with the upload/Google/delete actions below — they all touch the same avatar row, so a
// single per-user bucket is enough to stop abuse across all three.
const AVATAR_WRITE_BUCKET_LIMIT = 10;
const AVATAR_WRITE_BUCKET_WINDOW_S = 3600;
const AVATAR_READ_LIMIT_PER_IP = 300;
const AVATAR_READ_WINDOW_S = 60;

export const avatarsRouter = new Hono<AppEnv>();

async function checkWriteLimit(rateLimit: { check(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean }> }, userId: string): Promise<void> {
  const limit = await rateLimit.check(`avatar-write:${userId}`, AVATAR_WRITE_BUCKET_LIMIT, AVATAR_WRITE_BUCKET_WINDOW_S);
  if (!limit.allowed) throw ApiErrors.rateLimited();
}

// `POST/DELETE /profiles/me/avatar[/google]` — the authenticated owner manages their own photo.
avatarsRouter.post("/profiles/me/avatar", requireAuth(), zBody(uploadAvatarSchema), async (c) => {
  const user = currentUser(c);
  const { rateLimit, avatars } = c.var.services;
  await checkWriteLimit(rateLimit, user.id);
  const avatarUrl = await avatars.upload(user.id, c.req.valid("json"));
  return reply(c, { avatarUrl }, 201);
});

avatarsRouter.delete("/profiles/me/avatar", requireAuth(), async (c) => {
  const user = currentUser(c);
  const { rateLimit, avatars } = c.var.services;
  await checkWriteLimit(rateLimit, user.id);
  await avatars.remove(user.id);
  return reply(c, { ok: true });
});

avatarsRouter.post("/profiles/me/avatar/google", requireAuth(), async (c) => {
  const user = currentUser(c);
  const { rateLimit, avatars } = c.var.services;
  await checkWriteLimit(rateLimit, user.id);
  const avatarUrl = await avatars.useGoogleImage(user.id, user.image);
  return reply(c, { avatarUrl }, 201);
});

// `GET /avatars/:userId` — public; gated on the owner's `show_avatar` privacy, except that the owner
// themself always gets their own photo (so the /perfil preview works while it is still hidden).
avatarsRouter.get("/avatars/:userId", optionalAuth, async (c) => {
  const { rateLimit, avatars } = c.var.services;
  const limit = await rateLimit.check(`avatar-read-ip:${hashIp(c.var.ip)}`, AVATAR_READ_LIMIT_PER_IP, AVATAR_READ_WINDOW_S);
  if (!limit.allowed) throw ApiErrors.rateLimited();

  const userId = c.req.param("userId");
  const viewer = c.var.user;
  const avatar = await avatars.getForOwner(userId, viewer?.id === userId, viewer?.id);
  const etag = `"${avatar.sha256}"`;
  // Never cached by shared caches (private), and always revalidated — `show_avatar` can be
  // toggled off at any moment and the response must reflect that on the very next request.
  // The body depends on who is asking (owner vs. others), hence `Vary: Cookie`.
  // Exception: a URL whose `v` equals the current content hash prefix is content-addressed (a new
  // upload yields a new `v`), so it is immutable. Only reached once getForOwner passed the privacy gate.
  const version = c.req.query("v");
  const contentAddressed = typeof version === "string" && version === avatar.sha256.slice(0, 12);
  const headers: Record<string, string> = {
    ETag: etag,
    "Cache-Control": contentAddressed ? "private, max-age=31536000, immutable" : "private, no-cache",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  };

  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers });

  headers["Content-Type"] = avatar.mimeType;
  return new Response(new Uint8Array(avatar.bytes), { status: 200, headers });
});
