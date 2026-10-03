import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { Auth } from "../auth/auth.instance.js";
import { buildNotificationService, freshDb, getRoom, insertUsers } from "../test-utils.js";
import { RoomStateService } from "../rooms/room-state.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { RoomCache } from "../common/cache/room-cache.service.js";
import { TableNamesService } from "./table-names.service.js";

const mockAuth = { api: { getSession: async () => null } } as unknown as Auth;

describe("TableNamesService room-cache invalidation", () => {
  it("adminClearNickname drops the cached layout so the map stops showing the old nickname", async () => {
    const db = await freshDb();
    const cache = new RoomCache();
    const roomState = new RoomStateService(db);
    const gateway = new RoomRealtimeGateway(roomState, mockAuth, buildNotificationService(db));
    const svc = new TableNamesService(db, new RestrictionService(db), gateway, cache);
    const room = await getRoom(db);
    await insertUsers(db, ["admin1"]);

    const [table] = (await cache.getLayout(db, room.id)).tables;
    await db.update(schema.roomTables).set({ nickname: "La Ballena" }).where(eq(schema.roomTables.id, table!.id));
    cache.invalidate(room.id);
    expect((await cache.getLayout(db, room.id)).tables.find((t) => t.id === table!.id)?.nickname).toBe("La Ballena");

    await svc.adminClearNickname(table!.id, "admin1");
    expect((await cache.getLayout(db, room.id)).tables.find((t) => t.id === table!.id)?.nickname).toBeNull();
  });
});
