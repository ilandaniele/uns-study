import { getTableColumns, sql } from "drizzle-orm";
import { chunk, rowsPerInsert, type Db } from "./client.js";
import { generateRoomLayout } from "./layout.js";
import { roomTables, rooms, seatCurrentState, seats } from "./schema/rooms.js";
import { chatRooms } from "./schema/chat.js";

export const INITIAL_CHAT_ROOM = {
  slug: "sala-principal",
  name: "#sala-principal",
};

export const INITIAL_ROOM = {
  slug: "principal",
  name: "Sala principal",
  description: null as string | null,
  // Sala de estudio, Bahía Blanca (confirmed by the project owner).
  latitude: -38.7018942,
  longitude: -62.2702852,
  geofenceRadiusM: 50,
  timezone: "America/Argentina/Buenos_Aires",
  dailyResetTime: "04:00",
};

/** Rows per multi-row INSERT for `table`, counting every column as a bound parameter. */
function batch(table: Parameters<typeof getTableColumns>[0]): number {
  return rowsPerInsert(Object.keys(getTableColumns(table)).length);
}

/**
 * Idempotent: upserts the initial room, its tables and seats, keyed by slug/code, in one synchronous
 * transaction. Multi-row inserts are chunked to stay under SQLite's bound-parameter limit.
 */
export async function seedInitialRoom(db: Db): Promise<void> {
  const layout = generateRoomLayout();

  db.transaction((tx) => {
    const [room] = tx
      .insert(rooms)
      .values({ ...INITIAL_ROOM, active: true })
      .onConflictDoUpdate({
        target: rooms.slug,
        // latitude/longitude/geofenceRadiusM are intentionally NOT overwritten here: admins can
        // calibrate them in production (see AdminRoomsService.updateGeofence), and this seed runs on
        // every boot — re-running it must never clobber a calibrated geofence back to the default.
        set: {
          name: INITIAL_ROOM.name,
          description: INITIAL_ROOM.description,
          timezone: INITIAL_ROOM.timezone,
          dailyResetTime: INITIAL_ROOM.dailyResetTime,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning()
      .all();

    if (!room) throw new Error("Failed to upsert room");

    const tableIdByCode = new Map<string, string>();
    for (const part of chunk(layout.tables, batch(roomTables))) {
      const rows = tx
        .insert(roomTables)
        .values(
          part.map((t) => ({
            roomId: room.id,
            code: t.code,
            label: t.label,
            type: t.type,
            x: t.x,
            y: t.y,
            width: t.width,
            height: t.height,
            rotation: t.rotation,
          })),
        )
        .onConflictDoUpdate({
          target: [roomTables.roomId, roomTables.code],
          set: {
            label: sql`excluded.label`,
            type: sql`excluded.type`,
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            width: sql`excluded.width`,
            height: sql`excluded.height`,
            rotation: sql`excluded.rotation`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: roomTables.id, code: roomTables.code })
        .all();
      for (const r of rows) tableIdByCode.set(r.code, r.id);
    }

    const seatIds: string[] = [];
    for (const part of chunk(layout.seats, batch(seats))) {
      const rows = tx
        .insert(seats)
        .values(
          part.map((s) => {
            const tableId = tableIdByCode.get(s.tableCode);
            if (!tableId) throw new Error(`Unknown table code ${s.tableCode}`);
            return {
              roomId: room.id,
              tableId,
              code: s.code,
              seatNumber: s.seatNumber,
              x: s.x,
              y: s.y,
              rotation: s.rotation,
              active: true,
            };
          }),
        )
        .onConflictDoUpdate({
          target: [seats.roomId, seats.code],
          set: {
            tableId: sql`excluded.table_id`,
            seatNumber: sql`excluded.seat_number`,
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            rotation: sql`excluded.rotation`,
            active: true,
            updatedAt: new Date(),
          },
        })
        .returning({ id: seats.id })
        .all();
      for (const r of rows) seatIds.push(r.id);
    }

    for (const part of chunk(seatIds, batch(seatCurrentState))) {
      tx.insert(seatCurrentState)
        .values(part.map((seatId) => ({ seatId, status: "UNKNOWN" as const, confidence: 0 })))
        .onConflictDoNothing({ target: seatCurrentState.seatId })
        .run();
    }

    tx.insert(chatRooms)
      .values({ roomId: room.id, slug: INITIAL_CHAT_ROOM.slug, name: INITIAL_CHAT_ROOM.name })
      .onConflictDoUpdate({
        target: [chatRooms.roomId, chatRooms.slug],
        set: { name: INITIAL_CHAT_ROOM.name, updatedAt: new Date() },
      })
      .run();
  });
}
