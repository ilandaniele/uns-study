import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";

// `env.ts` reads ADMIN_EMAILS once at import time, so each test re-imports it (with `vi.resetModules`)
// after setting `process.env.ADMIN_EMAILS`, to exercise the env-bootstrap path in isolation.
async function importRolesService(adminEmails: string | undefined) {
  vi.resetModules();
  if (adminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = adminEmails;
  const { RolesService } = await import("./roles.service.js");
  return RolesService;
}

describe("RolesService", () => {
  let db: Db;
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(async () => {
    db = await freshDb();
    await insertUsers(db, ["u1"]);
  });

  afterEach(() => {
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it("hasRole is false with no roles assigned", async () => {
    const RolesService = await importRolesService(undefined);
    const svc = new RolesService(db);
    await expect(svc.hasRole("u1", ["ADMIN", "MODERATOR"])).resolves.toBe(false);
  });

  it("ensureAdminFromEnv grants ADMIN when the email is in ADMIN_EMAILS (case-insensitive)", async () => {
    const RolesService = await importRolesService("Admin@Example.com, other@example.com");
    const svc = new RolesService(db);

    await svc.ensureAdminFromEnv("u1", "ADMIN@EXAMPLE.COM", true);
    await expect(svc.hasRole("u1", ["ADMIN"])).resolves.toBe(true);
  });

  it("ensureAdminFromEnv is idempotent", async () => {
    const RolesService = await importRolesService("admin@example.com");
    const svc = new RolesService(db);

    await svc.ensureAdminFromEnv("u1", "admin@example.com", true);
    await svc.ensureAdminFromEnv("u1", "admin@example.com", true);
    await expect(svc.rolesFor("u1")).resolves.toEqual(["ADMIN"]);
  });

  it("ensureAdminFromEnv does nothing when the email is not listed", async () => {
    const RolesService = await importRolesService("someone-else@example.com");
    const svc = new RolesService(db);

    await svc.ensureAdminFromEnv("u1", "admin@example.com", true);
    await expect(svc.hasRole("u1", ["ADMIN"])).resolves.toBe(false);
  });

  it("ensureAdminFromEnv does nothing when the email is not verified", async () => {
    const RolesService = await importRolesService("admin@example.com");
    const svc = new RolesService(db);

    await svc.ensureAdminFromEnv("u1", "admin@example.com", false);
    await expect(svc.hasRole("u1", ["ADMIN"])).resolves.toBe(false);

    // Verifying later still works: the unverified attempt must not be cached as "ensured".
    await svc.ensureAdminFromEnv("u1", "admin@example.com", true);
    await expect(svc.hasRole("u1", ["ADMIN"])).resolves.toBe(true);
  });
});
