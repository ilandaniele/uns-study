import { describe, expect, it } from "vitest";
import { RateLimitService } from "./rate-limit.service.js";
import { BlocksController } from "../blocks/blocks.controller.js";
import { DmController } from "../dm/dm.controller.js";
import { ProfilesController } from "../profiles/profiles.controller.js";
import { QrResolveController } from "../qr/qr.controller.js";
import { StudyController } from "../study/study.controller.js";
import type { BlocksService } from "../blocks/blocks.service.js";
import type { DmService } from "../dm/dm.service.js";
import type { ProfilesService } from "../profiles/profiles.service.js";
import type { QrService } from "../qr/qr.service.js";
import type { StudyService } from "../study/study.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";

const user = { id: "u1", name: "u1", email: "u1@example.test", image: null };
const stub = <T>(o: object) => o as unknown as T;

async function exhaust(limit: number, call: () => Promise<unknown>) {
  for (let i = 0; i < limit; i++) await call();
  await expect(call()).rejects.toMatchObject({ code: "RATE_LIMITED" });
}

describe("rate limits on previously unrated writes", () => {
  it("POST /conversations: 10/h per user", async () => {
    const dm = stub<DmService>({ getOrCreateConversation: async () => ({}) });
    const c = new DmController(dm, new RateLimitService(), stub<RoomRealtimeGateway>({}), stub<NotificationService>({}));
    await exhaust(10, () => c.create(user, { userId: "u2" }));
  });

  it("block and unblock share a 30/h per-user bucket", async () => {
    const blocks = stub<BlocksService>({ block: async () => {}, unblock: async () => {} });
    const c = new BlocksController(blocks, new RateLimitService());
    for (let i = 0; i < 15; i++) {
      await c.block(user, "u2");
      await c.unblock(user, "u2");
    }
    await expect(c.block(user, "u2")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("PATCH /profiles/me and /privacy share a 30/h per-user bucket", async () => {
    const profiles = stub<ProfilesService>({ updateMyProfile: async () => ({}), updateMyPrivacy: async () => ({}) });
    const c = new ProfilesController(profiles, new RateLimitService());
    for (let i = 0; i < 15; i++) {
      await c.updateMe(user, {});
      await c.updateMyPrivacy(user, {});
    }
    await expect(c.updateMe(user, {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("POST /study/start|stop: 60/h per user", async () => {
    const study = stub<StudyService>({ start: async () => ({}), stop: async () => {} });
    const c = new StudyController(study, new RateLimitService());
    for (let i = 0; i < 30; i++) {
      await c.start(user, { roomId: "r", lookingForGroup: false } as never);
      await c.stop(user);
    }
    await expect(c.stop(user)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("GET /qr/:token: 60/min per IP", async () => {
    const qr = stub<QrService>({ resolve: async () => ({}) });
    const c = new QrResolveController(qr, new RateLimitService());
    await exhaust(60, () => c.resolve("tok", "1.1.1.1"));
    await expect(c.resolve("tok", "2.2.2.2")).resolves.toEqual({});
  });
});
