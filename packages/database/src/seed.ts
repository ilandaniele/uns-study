import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { createDb } from "./client.js";
import { generateRoomLayout } from "./layout.js";
import { roomTables, rooms, seatCurrentState, seats } from "./schema/rooms.js";
import { chatRooms } from "./schema/chat.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const INITIAL_CHAT_ROOM = {
  slug: "sala-principal",
  name: "#sala-principal",
};

export const INITIAL_ROOM = {
  slug: "principal",
  name: "Sala principal",
  description: null as string | null,
  // Sala de estudio, Bahía Blanca (confirmed by the project owner).
  latitude: -38.70138372483678,
  longitude: -62.270139753196005,
  geofenceRadiusM: 50,
  timezone: "America/Argentina/Buenos_Aires",
  dailyResetTime: "04:00",
};

/** Idempotent: upserts the initial room, its tables and seats, keyed by slug/code. */
export async function seedInitialRoom(db: Db): Promise<void> {
  const layout = generateRoomLayout();

  const [room] = await db
    .insert(rooms)
    .values({ ...INITIAL_ROOM, active: true })
    .onConflictDoUpdate({
      target: rooms.slug,
      // latitude/longitude/geofenceRadiusM are intentionally NOT overwritten here: admins can
      // calibrate them in production (see AdminRoomsService.updateGeofence), and this seed runs on
      // every Fly boot — re-running it must never clobber a calibrated geofence back to the default.
      set: {
        name: INITIAL_ROOM.name,
        description: INITIAL_ROOM.description,
        timezone: INITIAL_ROOM.timezone,
        dailyResetTime: INITIAL_ROOM.dailyResetTime,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!room) throw new Error("Failed to upsert room");

  // One multi-row upsert per table (this runs on every boot): 3 round trips instead of ~220.
  const tableRows = await db
    .insert(roomTables)
    .values(
      layout.tables.map((t) => ({
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
    .returning({ id: roomTables.id, code: roomTables.code });
  const tableIdByCode = new Map(tableRows.map((r) => [r.code, r.id]));

  const seatRows = await db
    .insert(seats)
    .values(
      layout.seats.map((s) => {
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
    .returning({ id: seats.id });

  await db
    .insert(seatCurrentState)
    .values(seatRows.map((r) => ({ seatId: r.id, status: "UNKNOWN" as const, confidence: 0 })))
    .onConflictDoNothing({ target: seatCurrentState.seatId });

  await db
    .insert(chatRooms)
    .values({ roomId: room.id, slug: INITIAL_CHAT_ROOM.slug, name: INITIAL_CHAT_ROOM.name })
    .onConflictDoUpdate({
      target: [chatRooms.roomId, chatRooms.slug],
      set: { name: INITIAL_CHAT_ROOM.name, updatedAt: new Date() },
    });
}

async function main() {
  const db = createDb();
  await seedInitialRoom(db);
  console.log("Seed complete.");
}

// Match on the CLI file name too: when bundled into an app, import.meta.url is that app's entry.
const isMain = path.basename(process.argv[1] ?? "") === "seed.ts" && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]!);
if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
