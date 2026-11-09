import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("crawler access to the garden noindex", () => {
  it("allows production crawlers to read noindex on /jardin while retaining other exclusions", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "production");
    vi.resetModules();
    const { default: robots } = await import("../../app/robots");
    const rules = robots().rules;
    expect(rules).toEqual([expect.objectContaining({ userAgent: "*", allow: "/" })]);
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const exclusions = rule?.disallow;
    expect(exclusions).not.toContain("/jardin");
    expect(exclusions).toEqual(expect.arrayContaining(["/api/", "/admin", "/perfil", "/u/"]));
  });

  it("continues to block every route on staging", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "staging");
    vi.resetModules();
    const { default: robots } = await import("../../app/robots");
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
});
