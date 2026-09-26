import { Global, Module } from "@nestjs/common";
import { SecurityEventService } from "./security-event.service.js";
import { RateLimitService } from "./rate-limit.service.js";
import { TurnstileService } from "./turnstile.service.js";
import { AbusePolicyService } from "./abuse-policy.service.js";

@Global()
@Module({
  providers: [SecurityEventService, RateLimitService, TurnstileService, AbusePolicyService],
  exports: [SecurityEventService, RateLimitService, TurnstileService, AbusePolicyService],
})
export class SecurityModule {}
