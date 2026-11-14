import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, getRoom, insertUsers } from "../test-utils.js";
import { AnnouncementsService } from "./announcements.service.js";

describe("AnnouncementsService", () => {
  let db: Db;
  let svc: AnnouncementsService;
  let roomId: string;

  beforeEach(async () => {
    db = freshDb();
    svc = new AnnouncementsService(db);
    const room = await getRoom(db);
    roomId = room.id;
    await insertUsers(db, ["admin1"]);
  });

  it("returns a global announcement (roomId null) for any room", async () => {
    await svc.create({ title: "Mantenimiento", body: "La sala cierra a las 22." }, "admin1");
    const active = await svc.listActive(roomId);
    expect(active).toHaveLength(1);
    expect(active[0]?.roomId).toBeNull();
  });

  it("excludes announcements scoped to a different room", async () => {
    const [otherRoom] = await db
      .insert(schema.rooms)
      .values({
        slug: "otra-sala",
        name: "Otra sala",
        timezone: "America/Argentina/Buenos_Aires",
        latitude: 0,
        longitude: 0,
        geofenceRadiusM: 50,
        dailyResetTime: "04:00",
      })
      .returning();
    await svc.create({ roomId: otherRoom!.id, title: "Otra sala", body: "..." }, "admin1");
    await expect(svc.listActive(roomId)).resolves.toEqual([]);
  });

  it("excludes inactive announcements", async () => {
    await svc.create({ title: "Oculto", body: "...", active: false }, "admin1");
    await expect(svc.listActive(roomId)).resolves.toEqual([]);
  });

  it("excludes announcements that haven't started yet", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await svc.create({ title: "Futuro", body: "...", startsAt: future }, "admin1");
    await expect(svc.listActive(roomId)).resolves.toEqual([]);
  });

  it("excludes announcements whose window already ended", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await svc.create({ title: "Pasado", body: "...", endsAt: past }, "admin1");
    await expect(svc.listActive(roomId)).resolves.toEqual([]);
  });

  it("includes an announcement with no endsAt (open-ended)", async () => {
    await svc.create({ title: "Sin fin", body: "..." }, "admin1");
    const active = await svc.listActive(roomId);
    expect(active).toHaveLength(1);
    expect(active[0]?.endsAt).toBeNull();
  });

  it("update and remove reflect immediately in listActive", async () => {
    const created = await svc.create({ title: "Editable", body: "v1" }, "admin1");
    await svc.update(created.id, { body: "v2" });
    let active = await svc.listActive(roomId);
    expect(active[0]?.body).toBe("v2");

    await svc.remove(created.id);
    active = await svc.listActive(roomId);
    expect(active).toEqual([]);
  });

  it("rejects invalid closure windows both on creation and partial edits", async () => {
    const input = { title: "Cierre", body: "UNS", closesRoom: true,
      startsAt: "2026-11-14T12:00:00Z", endsAt: "2026-11-14T12:00:00Z" };
    await expect(svc.create(input, "admin1")).rejects.toThrow("posterior");
    const created = await svc.create({ ...input, endsAt: "2026-11-14T14:00:00Z" }, "admin1");
    await expect(svc.update(created.id, { endsAt: "2026-11-14T11:00:00Z" })).rejects.toThrow("posterior");
    await expect(svc.update(created.id, { startsAt: "2026-11-14T15:00:00Z" })).rejects.toThrow("posterior");
    await expect(svc.update(created.id, { endsAt: null })).resolves.toMatchObject({ closesRoom: true, endsAt: null });
  });
});
