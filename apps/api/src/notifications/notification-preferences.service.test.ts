import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { NotificationPreferencesService } from "./notification-preferences.service.js";

describe("NotificationPreferencesService", () => {
  let db: Db;
  let svc: NotificationPreferencesService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new NotificationPreferencesService(db);
    await insertUsers(db, ["u1"]);
  });

  it("defaults seatFreed and adminPresent off, checkinExpiry on", async () => {
    expect(await svc.get("u1")).toEqual({ seatFreed: false, adminPresent: false, checkinExpiry: true });
  });

  it("updates only the given fields", async () => {
    await svc.update("u1", { seatFreed: true });
    expect(await svc.get("u1")).toEqual({ seatFreed: true, adminPresent: false, checkinExpiry: true });

    await svc.update("u1", { adminPresent: true });
    expect(await svc.get("u1")).toEqual({ seatFreed: true, adminPresent: true, checkinExpiry: true });
  });
});
