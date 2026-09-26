import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AUTH } from "./auth.tokens.js";
import type { Auth } from "./auth.instance.js";
import { ApiErrors } from "../common/api-error.js";
import { toFetchHeaders, type RequestUser } from "./request-user.js";

async function resolveUser(auth: Auth, req: Request): Promise<RequestUser | null> {
  const session = await auth.api.getSession({ headers: toFetchHeaders(req.headers) });
  if (!session?.user) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null };
}

/** Requires an authenticated Better Auth session; populates `req.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = await resolveUser(this.auth, req);
    if (!user) throw ApiErrors.unauthenticated();
    req.user = user;
    return true;
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
