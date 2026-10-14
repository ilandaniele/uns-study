import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@sala/database";
import { freshDb, getRoom } from "../test-utils.js";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { QrService } from "./qr.service.js";

describe("QrService", () => {
  let db: Db;
  let svc: QrService;
  let roomId: string;
  let tableId: string;
  let tableCode: string;

  beforeEach(async () => {
    db = freshDb();
    svc = new QrService(db);
    const room = await getRoom(db);
    roomId = room.id;
    const [table] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.roomId, roomId)).limit(1);
    tableId = table!.id;
    tableCode = table!.code;
  });

  it("creates a room-wide QR code and resolves it", async () => {
    const created = await svc.create(roomId, null);
    expect(created.tableCode).toBeNull();
    expect(created.active).toBe(true);

    const resolved = await svc.resolve(created.token);
    const room = await getRoom(db);
    expect(resolved).toEqual({ roomSlug: room.slug, tableCode: null });
  });

  it("increments scan_count and last_scanned_at on each successful resolve only", async () => {
    const created = await svc.create(roomId, null);
    expect(created.scanCount).toBe(0);
    expect(created.lastScannedAt).toBeNull();
    await svc.resolve(created.token);
    await svc.resolve(created.token);
    await expect(svc.resolve("bogus")).rejects.toBeDefined();
    const [listed] = await svc.list(roomId);
    expect(listed?.scanCount).toBe(2);
    expect(listed?.lastScannedAt).not.toBeNull();
  });

  it("creates a table-scoped QR code and resolves it with the table code", async () => {
    const created = await svc.create(roomId, tableCode);
    const resolved = await svc.resolve(created.token);
    expect(resolved.tableCode).toBe(tableCode);
  });

  it("resolving an unknown token throws INVALID_QR", async () => {
    await expect(svc.resolve("does-not-exist")).rejects.toMatchObject({ code: "INVALID_QR" });
  });

  it("deactivate makes the token unresolvable", async () => {
    const created = await svc.create(roomId, null);
    await svc.deactivate(roomId, created.id);
    await expect(svc.resolve(created.token)).rejects.toMatchObject({ code: "INVALID_QR" });

    const [row] = await db.select().from(schema.roomQrCodes).where(eq(schema.roomQrCodes.id, created.id));
    expect(row?.active).toBe(false);
  });

  it("list returns codes for the room with their table code", async () => {
    await svc.create(roomId, tableCode);
    await svc.create(roomId, null);
    const list = await svc.list(roomId);
    expect(list).toHaveLength(2);
  });

  it("isValidForTable is true for a room-wide code on any table", async () => {
    const created = await svc.create(roomId, null);
    expect(await svc.isValidForTable(created.token, roomId, tableId)).toBe(true);
  });

  it("isValidForTable is true only for the matching table on a table-scoped code", async () => {
    const created = await svc.create(roomId, tableCode);
    expect(await svc.isValidForTable(created.token, roomId, tableId)).toBe(true);

    const [otherTable] = await db.select().from(schema.roomTables).where(eq(schema.roomTables.roomId, roomId));
    // Insert a second table to prove mismatch is rejected.
    const [newTable] = await db
      .insert(schema.roomTables)
      .values({ roomId, code: "ZZZ", label: "Otra", type: "MAIN_TABLE", x: 0, y: 0, width: 1, height: 1 })
      .returning();
    expect(await svc.isValidForTable(created.token, roomId, newTable!.id)).toBe(false);
    expect(otherTable).toBeDefined();
  });

  it("isValidForTable ignores an invalid/missing token instead of throwing", async () => {
    expect(await svc.isValidForTable(null, roomId, tableId)).toBe(false);
    expect(await svc.isValidForTable("bogus", roomId, tableId)).toBe(false);
  });

  it("isValidForTable is false once the code is deactivated", async () => {
    const created = await svc.create(roomId, null);
    await svc.deactivate(roomId, created.id);
    expect(await svc.isValidForTable(created.token, roomId, tableId)).toBe(false);
  });
});
