import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { ReputationService } from "./reputation.service.js";

describe("ReputationService", () => {
  let db: Db;
  let svc: ReputationService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new ReputationService(db);
    await insertUsers(db, ["u1"]);
  });

  it("observationWeight is 1 for a user with no reputation row yet", async () => {
    expect(await svc.observationWeight("u1")).toBe(1);
  });

  it("increments spam_score and keeps weight at 1 below the threshold", async () => {
    await svc.incrementSpamScore("u1");
    await svc.incrementSpamScore("u1");
    await svc.incrementSpamScore("u1");
    await svc.incrementSpamScore("u1");
    expect(await svc.observationWeight("u1")).toBe(1);
  });

  it("drops the weight to 0.5 once spam_score reaches 5", async () => {
    for (let i = 0; i < 5; i++) await svc.incrementSpamScore("u1");
    expect(await svc.observationWeight("u1")).toBe(0.5);
  });
});
