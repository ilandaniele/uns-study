import { describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { dbSessionLookup } from "./ws-server.js";

describe("dbSessionLookup", () => {
  it("only counts sessions that exist, belong to the user and have not expired", async () => {
    const db = freshDb();
    await insertUsers(db, ["u1", "u2", "u3"]);
    const hour = 3600_000;
    await db.insert(schema.session).values([
      { id: "s1-live", token: "t1", userId: "u1", expiresAt: new Date(Date.now() + hour) },
      { id: "s2-expired", token: "t2", userId: "u2", expiresAt: new Date(Date.now() - hour) },
    ]);
    const sessions = dbSessionLookup(db);

    expect(await sessions.isActive({ userId: "u1", sessionId: "s1-live" })).toBe(true);
    expect(await sessions.isActive({ userId: "u2", sessionId: "s1-live" })).toBe(false); // wrong user
    expect(await sessions.isActive({ userId: "u2", sessionId: "s2-expired" })).toBe(false);
    expect(await sessions.isActive({ userId: "u1", sessionId: "missing" })).toBe(false);

    const live = await sessions.live(["u1", "u2", "u3"]);
    expect(live).toEqual([{ id: "s1-live", userId: "u1" }]);
  }, 30_000);
});
