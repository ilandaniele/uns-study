import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { QrResolveDto } from "@sala/contracts";
import { ApiErrors } from "../common/api-error.js";

export interface RoomQrCodeDto {
  id: string;
  token: string;
  tableCode: string | null;
  active: boolean;
  createdAt: string;
  scanCount: number;
  lastScannedAt: string | null;
}

/** Admin-managed QR codes (`room_qr_codes`) that resolve to a room, optionally scoped to a table. */
export class QrService {
  constructor(private readonly db: Db) {}

  async create(roomId: string, tableCode: string | null): Promise<RoomQrCodeDto> {
    let tableId: string | null = null;
    if (tableCode) {
      const [table] = await this.db
        .select()
        .from(schema.roomTables)
        .where(and(eq(schema.roomTables.roomId, roomId), eq(schema.roomTables.code, tableCode)))
        .limit(1);
      if (!table) throw ApiErrors.notFound("Mesa no encontrada.");
      tableId = table.id;
    }

    const token = randomBytes(24).toString("base64url");
    const [row] = await this.db.insert(schema.roomQrCodes).values({ roomId, tableId, token }).returning();
    if (!row) throw new Error("Failed to create QR code");
    return toDto(row, tableCode);
  }

  async list(roomId: string): Promise<RoomQrCodeDto[]> {
    const rows = await this.db
      .select({ qr: schema.roomQrCodes, tableCode: schema.roomTables.code })
      .from(schema.roomQrCodes)
      .leftJoin(schema.roomTables, eq(schema.roomTables.id, schema.roomQrCodes.tableId))
      .where(eq(schema.roomQrCodes.roomId, roomId));
    return rows.map((r) => toDto(r.qr, r.tableCode ?? null));
  }

  async deactivate(roomId: string, id: string): Promise<void> {
    await this.db
      .update(schema.roomQrCodes)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(schema.roomQrCodes.id, id), eq(schema.roomQrCodes.roomId, roomId)));
  }

  /** Public resolve: an active token maps to its room's slug and (if table-scoped) the table code. */
  async resolve(token: string): Promise<QrResolveDto> {
    // Atomic scan counter: a single UPDATE both validates the token and increments.
    const [scanned] = await this.db
      .update(schema.roomQrCodes)
      .set({ scanCount: sql`${schema.roomQrCodes.scanCount} + 1`, lastScannedAt: new Date() })
      .where(and(eq(schema.roomQrCodes.token, token), eq(schema.roomQrCodes.active, true)))
      .returning({ id: schema.roomQrCodes.id });
    if (!scanned) throw ApiErrors.invalidQr();
    const [row] = await this.db
      .select({ roomSlug: schema.rooms.slug, tableCode: schema.roomTables.code })
      .from(schema.roomQrCodes)
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomQrCodes.roomId))
      .leftJoin(schema.roomTables, eq(schema.roomTables.id, schema.roomQrCodes.tableId))
      .where(eq(schema.roomQrCodes.id, scanned.id))
      .limit(1);
    if (!row) throw ApiErrors.invalidQr();
    return { roomSlug: row.roomSlug, tableCode: row.tableCode ?? null };
  }

  /**
   * True when `token` is active, belongs to `roomId`, and is either room-wide (no table set) or
   * scoped to `tableId`. A missing/invalid token is simply not valid — never an error.
   */
  async isValidForTable(token: string | null | undefined, roomId: string, tableId: string): Promise<boolean> {
    if (!token) return false;
    const [row] = await this.db
      .select({ tableId: schema.roomQrCodes.tableId })
      .from(schema.roomQrCodes)
      .where(and(eq(schema.roomQrCodes.token, token), eq(schema.roomQrCodes.roomId, roomId), eq(schema.roomQrCodes.active, true)))
      .limit(1);
    if (!row) return false;
    return row.tableId === null || row.tableId === tableId;
  }
}

function toDto(row: typeof schema.roomQrCodes.$inferSelect, tableCode: string | null): RoomQrCodeDto {
  return {
    id: row.id,
    token: row.token,
    tableCode,
    active: row.active,
    createdAt: new Date(row.createdAt).toISOString(),
    scanCount: row.scanCount,
    lastScannedAt: row.lastScannedAt ? new Date(row.lastScannedAt).toISOString() : null,
  };
}
