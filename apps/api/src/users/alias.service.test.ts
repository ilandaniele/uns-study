import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { AliasService } from "./alias.service.js";
import { randomAlias } from "./alias-generator.js";

vi.mock("./alias-generator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./alias-generator.js")>();
  return { ...actual, randomAlias: vi.fn(actual.randomAlias) };
});

const mockedRandomAlias = vi.mocked(randomAlias);

describe("AliasService", () => {
  let db: Db;
  let svc: AliasService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new AliasService(db);
    mockedRandomAlias.mockReset();
    mockedRandomAlias.mockImplementation(() => "Carpincho Estudioso");
    await insertUsers(db, ["u1", "u2"]);
    await db.insert(schema.userProfiles).values([{ userId: "u1" }, { userId: "u2" }]);
  });

  it("assigns a random 'Noun Adjective' alias lazily and persists it", async () => {
    const alias = await svc.ensureAlias("u1");
    expect(alias).toBe("Carpincho Estudioso");
    const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
    expect(row?.alias).toBe("Carpincho Estudioso");
    expect(row?.aliasAnimal).toBe("carpincho");
  });

  it("is idempotent: calling twice returns the same alias without regenerating", async () => {
    const first = await svc.ensureAlias("u1");
    const second = await svc.ensureAlias("u1");
    expect(second).toBe(first);
    expect(mockedRandomAlias).toHaveBeenCalledTimes(1);
  });

  it("retries on a unique-index collision until it lands on a free alias", async () => {
    await svc.ensureAlias("u1"); // takes "Carpincho Estudioso"

    // u2's first two draws collide with u1's alias; the third is free.
    mockedRandomAlias.mockReset();
    mockedRandomAlias.mockReturnValueOnce("Carpincho Estudioso").mockReturnValueOnce("Carpincho Estudioso").mockReturnValueOnce("Puma Filosófico");

    const alias = await svc.ensureAlias("u2");
    expect(alias).toBe("Puma Filosófico");
    expect(mockedRandomAlias).toHaveBeenCalledTimes(3);
  });

  it("falls back to a numeric suffix after exhausting collision retries", async () => {
    await svc.ensureAlias("u1"); // takes "Carpincho Estudioso"
    mockedRandomAlias.mockImplementation(() => "Carpincho Estudioso"); // always collides for u2

    const alias = await svc.ensureAlias("u2");
    expect(alias).toMatch(/^Carpincho Estudioso \d{2}$/);
  });

  it("produces distinct aliases across many users (spot check, real generator)", async () => {
    mockedRandomAlias.mockRestore();
    const ids = Array.from({ length: 20 }, (_, i) => `bulk-${i}`);
    await insertUsers(db, ids);
    await db.insert(schema.userProfiles).values(ids.map((userId) => ({ userId })));

    const aliases = new Set<string>();
    for (const id of ids) aliases.add(await svc.ensureAlias(id));
    expect(aliases.size).toBe(ids.length);
  });

  it("releases an alias so it becomes NULL on the profile", async () => {
    await svc.ensureAlias("u1");
    await svc.releaseAlias("u1");
    const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
    expect(row?.alias).toBeNull();
  });

  it("never reissues a released alias — it's retired forever", async () => {
    await svc.ensureAlias("u1"); // takes "Carpincho Estudioso"
    await svc.releaseAlias("u1");

    // u2's first draw is the just-released alias, which must be skipped as retired.
    mockedRandomAlias.mockReset();
    mockedRandomAlias.mockReturnValueOnce("Carpincho Estudioso").mockReturnValueOnce("Hornero Madrugador");

    const alias = await svc.ensureAlias("u2");
    expect(alias).toBe("Hornero Madrugador");

    const [retired] = await db.select().from(schema.retiredAliases);
    expect(retired?.alias).toBe("Carpincho Estudioso");
  });

  it("rerolls: releases the old alias and assigns a fresh one", async () => {
    await svc.ensureAlias("u1");
    mockedRandomAlias.mockReturnValue("Hornero Madrugador");
    const rerolled = await svc.reroll("u1");
    expect(rerolled).toBe("Hornero Madrugador");
  });

  it("reassigns a legacy alias whose noun isn't a catalog animal, retiring the old one", async () => {
    await db.update(schema.userProfiles).set({ alias: "Mate Filosófico", aliasAnimal: null }).where(eq(schema.userProfiles.userId, "u1"));

    const alias = await svc.ensureAlias("u1");
    expect(alias).toBe("Carpincho Estudioso");
    const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
    expect(row?.aliasAnimal).toBe("carpincho");
    const retired = await db.select().from(schema.retiredAliases);
    expect(retired.map((r) => r.alias)).toEqual(["Mate Filosófico"]);
  });

  it("keeps a legacy alias that already uses a catalog animal and just records the animal", async () => {
    await db.update(schema.userProfiles).set({ alias: "Vizcacha Curiosa", aliasAnimal: null }).where(eq(schema.userProfiles.userId, "u1"));

    expect(await svc.ensureAlias("u1")).toBe("Vizcacha Curiosa");
    const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
    expect(row?.aliasAnimal).toBe("vizcacha");
    expect(mockedRandomAlias).not.toHaveBeenCalled();
  });

  it("batch helper lazily reassigns a profile whose aliasAnimal is null (legacy)", async () => {
    await db.update(schema.userProfiles).set({ alias: "Termo Prolijo" }).where(eq(schema.userProfiles.userId, "u1"));
    const map = await svc.ensureAliasesForProfiles([{ userId: "u1", identityMode: "HIDDEN", alias: "Termo Prolijo", aliasAnimal: null }]);
    expect(map.get("u1")).toBe("Carpincho Estudioso");
  });

  it("batch-assigns aliases only for HIDDEN profiles missing one", async () => {
    await db.update(schema.userProfiles).set({ identityMode: "FULL_NAME" }).where(eq(schema.userProfiles.userId, "u2"));

    const map = await svc.ensureAliasesForProfiles([
      { userId: "u1", identityMode: "HIDDEN", alias: null },
      { userId: "u2", identityMode: "FULL_NAME", alias: null },
    ]);

    expect(map.get("u1")).toBe("Carpincho Estudioso");
    expect(map.has("u2")).toBe(false);
  });

  it("batch helper returns an already-assigned alias without regenerating", async () => {
    const map = await svc.ensureAliasesForProfiles([{ userId: "u1", identityMode: "HIDDEN", alias: "Vizcacha Curiosa" }]);
    expect(map.get("u1")).toBe("Vizcacha Curiosa");
    expect(mockedRandomAlias).not.toHaveBeenCalled();
  });
});
