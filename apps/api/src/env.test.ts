import { afterEach, describe, expect, it, vi } from "vitest";
import { env, initEnv, loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies the documented defaults", () => {
    const e = loadEnv({ IP_HASH_SALT: "s" });
    expect(e.presenceMaxAgeS).toBe(120);
    expect(e.presenceMaxAccuracyM).toBe(150);
    expect(e.seatVerifierMinConfidence).toBe(0.8);
    expect(e.subscriptionPriceArs).toBe(1500);
    expect(e.webOrigins).toEqual(["http://localhost:3000"]);
    expect(e.publicWebUrl).toBe("http://localhost:3000");
    expect(e.opsImportToken).toBe("");
    expect(e.maintenanceMode).toBe(false);
    expect(e.r2Binding).toBe(false);
  });

  it("forces e2e hooks off in production", () => {
    expect(loadEnv({ NODE_ENV: "production", E2E_TEST_HOOKS: "true", IP_HASH_SALT: "s" }).e2eTestHooks).toBe(false);
    expect(loadEnv({ NODE_ENV: "development", E2E_TEST_HOOKS: "1", IP_HASH_SALT: "s" }).e2eTestHooks).toBe(true);
  });

  it("reads WEB_ORIGINS and derives the public URL", () => {
    const a = loadEnv({ WEB_ORIGINS: "https://a.test, https://b.test", IP_HASH_SALT: "s" });
    expect(a.webOrigins).toEqual(["https://a.test", "https://b.test"]);
    expect(a.publicWebUrl).toBe("https://a.test");
    expect(loadEnv({ PUBLIC_WEB_URL: "https://x.test/", IP_HASH_SALT: "s" }).publicWebUrl).toBe("https://x.test");
  });

  it("reads R2_BUCKET", () => {
    expect(loadEnv({ R2_BUCKET: "b", IP_HASH_SALT: "s" }).r2Bucket).toBe("b");
  });

  it("parses numbers, booleans and lists, ignoring garbage numbers", () => {
    const e = loadEnv({
      IP_HASH_SALT: "s",
      PRESENCE_MAX_AGE_S: "30",
      PRESENCE_MAX_ACCURACY_M: "abc",
      PRESENCE_DEV_BYPASS: "true",
      MAINTENANCE_MODE: "1",
      ADMIN_EMAILS: " A@x.test, b@x.test ,",
      OWNER_EMAIL: " Boss@X.test ",
    });
    expect(e.presenceMaxAgeS).toBe(30);
    expect(e.presenceMaxAccuracyM).toBe(150);
    expect(e.presenceDevBypass).toBe(true);
    expect(e.maintenanceMode).toBe(true);
    expect(e.adminEmails).toEqual(["a@x.test", "b@x.test"]);
    expect(e.ownerEmail).toBe("boss@x.test");
  });

  it("warns and falls back when IP_HASH_SALT is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(loadEnv({}).ipHashSalt).toBe("dev-salt-change-me");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("initEnv", () => {
  const touched = ["TEST_INIT_ENV_VAR", "OPS_IMPORT_TOKEN", "IP_HASH_SALT"];
  const before = { ...env };
  afterEach(() => {
    for (const k of touched) delete process.env[k];
    Object.assign(env, before);
  });

  it("copies string bindings into process.env and refreshes the singleton", () => {
    initEnv({ OPS_IMPORT_TOKEN: "tok", IP_HASH_SALT: "salt", TEST_INIT_ENV_VAR: "x", EVIDENCE: {}, APP: { not: "a string" } });
    expect(process.env.TEST_INIT_ENV_VAR).toBe("x");
    expect(process.env.APP).toBeUndefined();
    expect(env.opsImportToken).toBe("tok");
    expect(env.ipHashSalt).toBe("salt");
    expect(env.r2Binding).toBe(true);
  });

  it("reports no R2 binding when EVIDENCE is absent", () => {
    initEnv({ IP_HASH_SALT: "salt" });
    expect(env.r2Binding).toBe(false);
  });
});
