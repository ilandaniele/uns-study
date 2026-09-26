import { Injectable } from "@nestjs/common";
import { env } from "../env.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

interface TurnstileSiteVerifyResponse {
  success?: boolean;
}

/**
 * Cloudflare Turnstile verification, used to challenge suspicious flows flagged by
 * `AbusePolicyService`. Disabled entirely (accepts nothing to verify) unless
 * `TURNSTILE_SECRET_KEY` is set — fine for local dev, required in production for the
 * challenge to actually gate anything.
 */
@Injectable()
export class TurnstileService {
  isEnabled(): boolean {
    return Boolean(env.turnstileSecretKey);
  }

  /** Verifies a client-submitted token. Fails closed: disabled, missing token, non-2xx, or
   * network/timeout errors all resolve to `false`. */
  async verify(token: string | null | undefined, ip?: string | null): Promise<boolean> {
    if (!this.isEnabled() || !token) return false;

    const body = new URLSearchParams();
    body.set("secret", env.turnstileSecretKey);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const res = await fetch(VERIFY_URL, { method: "POST", body, signal: controller.signal });
      if (!res.ok) return false;
      const data = (await res.json()) as TurnstileSiteVerifyResponse;
      return data.success === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
