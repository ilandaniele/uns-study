import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { signSocketToken, type SocketToken } from "./socket-token.js";

/** Issues short-lived Socket.IO auth tokens for the current session. Socket.IO connects straight
 *  to the API host (no same-origin proxy), so it can't read the Better Auth session cookie. */
@Controller("realtime")
@UseGuards(AuthGuard)
export class RealtimeTokenController {
  @Get("token")
  getToken(@CurrentUser() user: RequestUser): SocketToken {
    return signSocketToken(user.id);
  }
}
