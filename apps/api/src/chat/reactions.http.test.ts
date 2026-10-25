import { beforeAll, describe, expect, it } from "vitest";
import { schema } from "@sala/database";
import { baseHeaders, buildTestApp } from "../http/test-app.js";

describe("reaction HTTP permissions and validation", () => {
  let ctx: ReturnType<typeof buildTestApp>;
  let cookie: string;
  let threadId: string;
  let messageId: string;
  function request(
    method: string,
    path: string,
    session?: string,
    body?: unknown,
    origin?: string,
  ) {
    return ctx.app.request(`/api/v1${path}`, {
      method,
      headers: baseHeaders({
        ...(session ? { cookie: session } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(origin ? { origin } : {}),
      }),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  beforeAll(async () => {
    ctx = buildTestApp();
    const res = await ctx.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        name: "Synthetic reactor",
        email: "reactions@example.test",
        password: "synthetic-correct-horse-battery",
      }),
    });
    expect(res.status).toBe(200);
    const identity = (await res.json()) as { user: { id: string } };
    cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    threadId = ctx.db.select().from(schema.chatRooms).get()!.id;
    messageId = ctx.db
      .insert(schema.chatMessages)
      .values({
        chatRoomId: threadId,
        userId: identity.user.id,
        content: "Synthetic message",
      })
      .returning()
      .get().id;
  });
  it("requires auth and protects mutations from cross-origin requests", async () => {
    expect(
      (
        await request(
          "GET",
          `/message-reactions/ROOM/${threadId}?ids=${messageId}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "PUT",
          `/message-reactions/ROOM/${threadId}/${messageId}`,
          undefined,
          { emoji: "👍" },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "PUT",
          `/message-reactions/ROOM/${threadId}/${messageId}`,
          cookie,
          { emoji: "👍" },
          "https://outside.example",
        )
      ).status,
    ).toBe(403);
  });
  it("rejects unbounded batches, unknown emoji, invalid scope and arbitrary fields", async () => {
    expect(
      (
        await request(
          "GET",
          `/message-reactions/ROOM/${threadId}?ids=${Array(51).fill(messageId).join(",")}`,
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "GET",
          `/message-reactions/UNKNOWN/${threadId}?ids=${messageId}`,
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "PUT",
          `/message-reactions/ROOM/${threadId}/${messageId}`,
          cookie,
          { emoji: "unbounded" },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "PUT",
          `/message-reactions/ROOM/${threadId}/${messageId}`,
          cookie,
          { emoji: "👍", userId: "someone-else" },
        )
      ).status,
    ).toBe(400);
  });
  it("round trips emoji and personal selection, changes it, then removes it", async () => {
    const path = `/message-reactions/ROOM/${threadId}/${messageId}`;
    const saved = await request("PUT", path, cookie, { emoji: "👍" });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("cache-control")).toBe("private, no-store");
    expect(await saved.json()).toEqual({
      [messageId]: [{ emoji: "👍", count: 1, mine: true }],
    });
    expect(
      (
        await request(
          "GET",
          `/message-reactions/ROOM/${threadId}?ids=${messageId}`,
          cookie,
        )
      ).status,
    ).toBe(200);
    await request("PUT", path, cookie, { emoji: "🐶" });
    const removed = await request("PUT", path, cookie, { emoji: null });
    expect(await removed.json()).toEqual({ [messageId]: [] });
  });
  it("caps reaction mutations per person", async () => {
    const path = `/message-reactions/ROOM/${threadId}/${messageId}`;
    let limited = false;
    for (let i = 0; i < 41; i++) {
      const res = await request("PUT", path, cookie, { emoji: "👍" });
      if (res.status === 429) {
        limited = true;
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(limited).toBe(true);
  });
});
