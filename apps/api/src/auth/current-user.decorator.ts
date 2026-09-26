import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { RequestUser } from "./request-user.js";

/** Reads the authenticated user attached by `AuthGuard`/`OptionalAuthGuard`. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser | undefined => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
  return req.user;
});
