import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AUTH } from "../auth/auth.tokens.js";
import type { Auth } from "../auth/auth.instance.js";
import { ApiErrors } from "../common/api-error.js";
import { toFetchHeaders, type RequestUser } from "../auth/request-user.js";
import { RestrictionService } from "./restriction.service.js";
import { RolesService, type Role } from "./roles.service.js";

/** Shared session lookup + role check, parameterized by the allowed roles. */
abstract class RoleGuard implements CanActivate {
  protected abstract readonly allowedRoles: Role[];

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const session = await this.auth.api.getSession({ headers: toFetchHeaders(req.headers) });
    if (!session?.user) throw ApiErrors.unauthenticated();

    const user: RequestUser = { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null };
    const allowed = await this.roles.hasRole(user.id, this.allowedRoles);
    if (!allowed) throw ApiErrors.forbidden("Necesitás permisos de moderación para hacer esto.");

    // Same rule as AuthGuard: a suspended/banned account loses staff access too.
    await this.restrictions.assertNot(user.id, ["SUSPENDED", "BANNED"]);

    req.user = user;
    return true;
  }
}

/** Requires an authenticated session with role ADMIN or MODERATOR. */
@Injectable()
export class AdminGuard extends RoleGuard {
  protected readonly allowedRoles: Role[] = ["ADMIN", "MODERATOR"];
}

/** Requires an authenticated session with role ADMIN — for role-sensitive actions (bans, QR, announcements). */
@Injectable()
export class AdminOnlyGuard extends RoleGuard {
  protected readonly allowedRoles: Role[] = ["ADMIN"];
}
