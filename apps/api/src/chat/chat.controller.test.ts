import { beforeEach, describe, expect, it } from "vitest";
import { RateLimitService } from "../security/rate-limit.service.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import type { ChatService } from "./chat.service.js";
import { ChatController } from "./chat.controller.js";

function fakeUser(id: string) {
  return { id, name: id, email: `${id}@example.test`, image: null };
}

describe("ChatController rate limiting", () => {
  let rateLimit: RateLimitService;
  let controller: ChatController;

  beforeEach(() => {
    rateLimit = new RateLimitService();
    const chat = { createMessage: async () => ({ id: "m1", chatRoomId: "c1" }) } as unknown as ChatService;
    const realtime = { emitChatMessage: () => {} } as unknown as RoomRealtimeGateway;
    controller = new ChatController(chat, rateLimit, realtime);
  });

  it("allows up to 20 messages per minute then rate-limits", async () => {
    for (let i = 0; i < 20; i++) {
      await controller.create(fakeUser("u1"), "principal", { content: "hola" });
    }
    await expect(controller.create(fakeUser("u1"), "principal", { content: "hola" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("tracks limits independently per user", async () => {
    for (let i = 0; i < 20; i++) {
      await controller.create(fakeUser("u1"), "principal", { content: "hola" });
    }
    await expect(controller.create(fakeUser("u2"), "principal", { content: "hola" })).resolves.toBeDefined();
  });
});
