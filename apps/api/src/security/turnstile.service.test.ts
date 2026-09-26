import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../env.js";
import { TurnstileService } from "./turnstile.service.js";

describe("TurnstileService", () => {
  const originalSecret = env.turnstileSecretKey;

  afterEach(() => {
    env.turnstileSecretKey = originalSecret;
    vi.unstubAllGlobals();
  });

  it("is disabled when TURNSTILE_SECRET_KEY is not set", () => {
    env.turnstileSecretKey = "";
    expect(new TurnstileService().isEnabled()).toBe(false);
  });

  it("is enabled when TURNSTILE_SECRET_KEY is set", () => {
    env.turnstileSecretKey = "secret";
    expect(new TurnstileService().isEnabled()).toBe(true);
  });

  it("returns false without calling the network when disabled", async () => {
    env.turnstileSecretKey = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ok = await new TurnstileService().verify("some-token");
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false when no token is provided, even if enabled", async () => {
    env.turnstileSecretKey = "secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ok = await new TurnstileService().verify(null);
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true when Cloudflare reports success", async () => {
    env.turnstileSecretKey = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
    );
    const ok = await new TurnstileService().verify("good-token", "1.2.3.4");
    expect(ok).toBe(true);
  });

  it("returns false when Cloudflare reports failure", async () => {
    env.turnstileSecretKey = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }),
    );
    const ok = await new TurnstileService().verify("bad-token");
    expect(ok).toBe(false);
  });

  it("fails closed on a network error", async () => {
    env.turnstileSecretKey = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const ok = await new TurnstileService().verify("some-token");
    expect(ok).toBe(false);
  });
});
