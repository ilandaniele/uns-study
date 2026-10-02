import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AUTH } from "./auth.tokens.js";
import type { Auth } from "./auth.instance.js";
import { ApiErrors } from "../common/api-error.js";
import { toFetchHeaders, type RequestUser } from "./request-user.js";
import { ALLOW_RESTRICTED_KEY } from "./allow-restricted.decorator.js";
import { RestrictionService } from "../users/restriction.service.js";

const BLOCK_CACHE_TTL_MS = 30_000;

async function resolveUser(auth: Auth, req: Request): Promise<RequestUser | null> {
  const session = await auth.api.getSession({ headers: toFetchHeaders(req.headers) });
  if (!session?.user) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null, emailVerified: session.user.emailVerified === true };
}

/** Requires an authenticated Better Auth session; populates `req.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  /** userId -> whether a SUSPENDED/BANNED restriction was active, and when we looked. Bounds DB load to ~1 query / 30 s / user. */
  private readonly blockedCache = new Map<string, { blocked: boolean; at: number }>();

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = await resolveUser(this.auth, req);
    if (!user) throw ApiErrors.unauthenticated();

    const allowRestricted = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_RESTRICTED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowRestricted && (await this.isBlocked(user.id))) throw ApiErrors.restricted();
    req.user = user;
    return true;
  }

  private async isBlocked(userId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.blockedCache.get(userId);
    if (cached && now - cached.at < BLOCK_CACHE_TTL_MS) return cached.blocked;
    const active = await this.restrictions.activeRestrictions(userId);
    const blocked = active.some((r) => r.type === "SUSPENDED" || r.type === "BANNED");
    if (this.blockedCache.size > 5000) this.blockedCache.clear();
    this.blockedCache.set(userId, { blocked, at: now });
    return blocked;
  }
}

/** Resolves `req.user` when a session is present but never rejects anonymous requests. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    req.user = (await resolveUser(this.auth, req)) ?? undefined;
    return true;
  }
}
