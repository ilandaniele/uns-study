import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats, insertUsers } from "../test-utils.js";

describe("administrative bulk marks over HTTP and SQLite", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: string | null;
  let seats: Awaited<ReturnType<typeof getSeats>>;
  let roomId: string;
  beforeEach(async () => {
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["admin", "other-admin", "member"]);
    fixture.db.update(schema.user).set({ emailVerified: true }).run();
    fixture.db.insert(schema.userRoles).values([{ userId: "admin", role: "ADMIN" }, { userId: "other-admin", role: "ADMIN" }]).run();
    seats = await getSeats(fixture.db); roomId = (await getRoom(fixture.db)).id;
    actor = "admin";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });
  const call = (path: string, method = "GET", body?: unknown) => app.request(`/api/v1/admin/rooms/principal/${path}`, {
    method, headers: baseHeaders({ "content-type": "application/json" }), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  it("undoes the exact total-mark after reload without clearing earlier or later selected marks", async () => {
    expect((await call("mark-seats", "POST", { seatIds: [seats[0]!.id], status: "OCCUPIED" })).status).toBe(201);
    const marked = await call("mark-all-occupied", "POST", { minutes: 60 });
    expect(marked.status).toBe(201);
    const operation = await marked.json() as { actionId: string };
    const state = await call("mark-all-occupied/undo");
    expect((await state.json() as { actionId: string }).actionId).toBe(operation.actionId);
    actor = "other-admin";
    expect(await (await call("mark-all-occupied/undo")).json()).toBeNull();
    expect((await (await call("mark-all-occupied/undo", "POST", {})).json() as { count: number }).count).toBe(0);
    expect((await call("mark-seats", "POST", { seatIds: [seats[1]!.id], status: "FREE" })).status).toBe(201);
    actor = "admin";
    expect((await call("mark-all-occupied/undo", "POST", { actionId: operation.actionId })).status).toBe(201);
    const live = await fixture.services.roomState.getLiveSeatStates(roomId);
    expect(live.get(seats[0]!.id)?.status).toBe("OCCUPIED");
    expect(live.get(seats[1]!.id)?.status).toBe("FREE");
    expect(live.get(seats[2]!.id)?.status).toBe("UNKNOWN");
    expect(await (await call("mark-all-occupied/undo")).json()).toBeNull();
    expect((await (await call("mark-all-occupied/undo", "POST", { actionId: operation.actionId })).json() as { count: number }).count).toBe(0);
  });

  it("denies members and anonymous callers and never accepts a forged operation id", async () => {
    const marked = await call("mark-all-occupied", "POST", { minutes: 60 });
    const { actionId } = await marked.json() as { actionId: string };
    actor = "other-admin";
    expect((await call("mark-all-occupied/undo", "POST", { actionId })).status).toBe(400);
    actor = "member";
    expect((await call("mark-all-occupied/undo")).status).toBe(403);
    expect((await call("mark-all-occupied/undo", "POST", { actionId })).status).toBe(403);
    actor = null;
    expect((await call("mark-all-occupied/undo")).status).toBe(401);
    expect((await fixture.services.roomState.getLiveSeatStates(roomId)).get(seats[0]!.id)?.status).toBe("OCCUPIED");
    expect(fixture.db.select().from(schema.moderationActions).where(eq(schema.moderationActions.action, "ADMIN_MARK_ALL_OCCUPIED_UNDO")).all()).toHaveLength(0);
  });
});
