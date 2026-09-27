import { Controller, Get } from "@nestjs/common";
import { env } from "./env.js";

/** Public: which sign-in methods are configured, so the web only shows buttons that work. */
@Controller("auth-providers")
export class AuthProvidersController {
  @Get()
  get(): { emailPassword: true; google: boolean } {
    return { emailPassword: true, google: Boolean(env.googleClientId && env.googleClientSecret) };
  }
}
