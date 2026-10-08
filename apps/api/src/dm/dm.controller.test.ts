import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushBackground } from "../common/background.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import type { DmService } from "./dm.service.js";
import { DmController } from "./dm.controller.js";

function fakeUser(id: string) {
  return { id, name: id, email: `${id}@example.test`, image: null };
}

describe("DmController rate limiting", () => {
  let rateLimit: RateLimitService;
  let controller: DmController;

  beforeEach(() => {
    rateLimit = new RateLimitService();
    const dm = {
      sendMessage: async () => ({ id: "m1", conversationId: "c1" }),
      otherParticipant: async () => "u2",
    } as unknown as DmService;
    const realtime = { emitDm: () => {} } as unknown as RoomRealtimeGateway;
    controller = new DmController(dm, rateLimit, realtime, { notifyDirectMessage: async () => {} } as unknown as NotificationService);
  });

  it("allows up to 15 messages per minute then rate-limits", async () => {
    for (let i = 0; i < 15; i++) {
      await controller.sendMessage(fakeUser("u1"), "c1", { content: "hola" });
    }
    await expect(controller.sendMessage(fakeUser("u1"), "c1", { content: "hola" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("DmController push", () => {
  it("pushes the message to the other participant only, under the sender's public name", async () => {
    const notifyDirectMessage = vi.fn(async () => {});
    const dm = {
      sendMessage: async () => ({ id: "m1", conversationId: "c1", content: "hola, ¿venís?" }),
      otherParticipant: async () => "u2",
      publicDisplayName: async () => "Zorro Veloz",
    } as unknown as DmService;
    const realtime = { emitDm: () => {} } as unknown as RoomRealtimeGateway;
    const controller = new DmController(dm, new RateLimitService(), realtime, { notifyDirectMessage } as unknown as NotificationService);

    await controller.sendMessage(fakeUser("u1"), "c1", { content: "hola, ¿venís?" });
    await flushBackground();

    expect(notifyDirectMessage).toHaveBeenCalledTimes(1);
    expect(notifyDirectMessage).toHaveBeenCalledWith({
      recipientId: "u2",
      senderDisplayName: "Zorro Veloz",
      conversationId: "c1",
      content: "hola, ¿venís?",
    });
  });
});
