import type { Context, MiddlewareHandler } from "hono";
import type { Auth } from "../auth/auth.instance.js";
import { ApiErrors } from "../common/api-error.js";
import type { Role } from "../users/roles.service.js";
import type { AppEnv, RequestUser } from "./context.js";

const BLOCK_CACHE_TTL_MS = 30_000;
const BLOCK_CACHE_MAX = 5000;

/** userId -> whether a SUSPENDED/BANNED restriction was active, and when we looked. Bounds DB load to ~1 query / 30 s / user. */
const blockedCache = new Map<string, { blocked: boolean; at: number }>();

async function resolveUser(auth: Auth, c: Context<AppEnv>): Promise<RequestUser | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    emailVerified: session.user.emailVerified === true,
    sessionId: session.session?.id,
  };
}

async function isBlocked(c: Context<AppEnv>, userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = blockedCache.get(userId);
  if (cached && now - cached.at < BLOCK_CACHE_TTL_MS) return cached.blocked;
  const active = await c.var.services.restriction.activeRestrictions(userId);
  const blocked = active.some((r) => r.type === "SUSPENDED" || r.type === "BANNED");
  if (blockedCache.size > BLOCK_CACHE_MAX) blockedCache.clear();
  blockedCache.set(userId, { blocked, at: now });
  return blocked;
}

/** Requires an authenticated Better Auth session; sets `c.var.user`. */
export function requireAuth(opts?: { allowRestricted?: boolean }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await resolveUser(c.var.auth, c);
    if (!user) throw ApiErrors.unauthenticated();
    if (!opts?.allowRestricted && (await isBlocked(c, user.id))) throw ApiErrors.restricted();
    c.set("user", user);
    await next();
  };
}

/** Resolves `c.var.user` when a session is present but never rejects anonymous requests. */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", await resolveUser(c.var.auth, c));
  await next();
};

function roleGuard(allowedRoles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) throw ApiErrors.unauthenticated();

    const user: RequestUser = { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null };
    const allowed = await c.var.services.roles.hasRole(user.id, allowedRoles);
    if (!allowed) throw ApiErrors.forbidden("Necesitás permisos de moderación para hacer esto.");

    // Same rule as requireAuth: a suspended/banned account loses staff access too.
    await c.var.services.restriction.assertNot(user.id, ["SUSPENDED", "BANNED"]);

    c.set("user", user);
    await next();
  };
}

/** Requires an authenticated session with role ADMIN or MODERATOR. */
export const requireAdmin: MiddlewareHandler<AppEnv> = roleGuard(["ADMIN", "MODERATOR"]);

/** Requires an authenticated session with role ADMIN — for role-sensitive actions (bans, QR, announcements). */
export const requireAdminOnly: MiddlewareHandler<AppEnv> = roleGuard(["ADMIN"]);

/** Use after requireAuth(). 403 PRO_REQUIRED unless services.pro.isProUser(c.var.user.id). */
export function requirePro(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.var.user;
    if (!user) throw ApiErrors.unauthenticated();
    if (!(await c.var.services.pro.isProUser(user.id))) throw ApiErrors.proRequired();
    await next();
  };
}
