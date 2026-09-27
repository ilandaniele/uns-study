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
  name: "Sala de Estudio UNS",
  description: null as string | null,
  // Sala de estudio, UNS Bahía Blanca (confirmed by the project owner).
  latitude: -38.70138372483678,
  longitude: -62.270139753196005,
  geofenceRadiusM: 120,
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
      set: {
        name: INITIAL_ROOM.name,
        description: INITIAL_ROOM.description,
        latitude: INITIAL_ROOM.latitude,
        longitude: INITIAL_ROOM.longitude,
        geofenceRadiusM: INITIAL_ROOM.geofenceRadiusM,
        timezone: INITIAL_ROOM.timezone,
        dailyResetTime: INITIAL_ROOM.dailyResetTime,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!room) throw new Error("Failed to upsert room");

  const tableIdByCode = new Map<string, string>();
  for (const t of layout.tables) {
    const [row] = await db
      .insert(roomTables)
      .values({
        roomId: room.id,
        code: t.code,
        label: t.label,
        type: t.type,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        rotation: t.rotation,
      })
      .onConflictDoUpdate({
        target: [roomTables.roomId, roomTables.code],
        set: {
          label: t.label,
          type: t.type,
          x: t.x,
          y: t.y,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error(`Failed to upsert table ${t.code}`);
    tableIdByCode.set(t.code, row.id);
  }

  for (const s of layout.seats) {
    const tableId = tableIdByCode.get(s.tableCode);
    if (!tableId) throw new Error(`Unknown table code ${s.tableCode}`);

    const [seatRow] = await db
      .insert(seats)
      .values({
        roomId: room.id,
        tableId,
        code: s.code,
        seatNumber: s.seatNumber,
        x: s.x,
        y: s.y,
        rotation: s.rotation,
        active: true,
      })
      .onConflictDoUpdate({
        target: [seats.roomId, seats.code],
        set: {
          tableId,
          seatNumber: s.seatNumber,
          x: s.x,
          y: s.y,
          rotation: s.rotation,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!seatRow) throw new Error(`Failed to upsert seat ${s.code}`);

    await db
      .insert(seatCurrentState)
      .values({ seatId: seatRow.id, status: "UNKNOWN", confidence: 0 })
      .onConflictDoNothing({ target: seatCurrentState.seatId });
  }

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
