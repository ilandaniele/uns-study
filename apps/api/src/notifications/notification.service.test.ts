import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PushService } from "./push.service.js";
import { NotificationService } from "./notification.service.js";

const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(async (_subscription: unknown, _payload?: string) => undefined),
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification,
  },
}));
// `env.ts` reads `process.env.VAPID_*` once at module-evaluation time (before this file's
// `beforeEach` ever runs), so setting the env vars there wouldn't reach it — override the frozen
// values directly instead.
vi.mock("../env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../env.js")>();
  return { env: { ...actual.env, vapidPublicKey: "test-public-key", vapidPrivateKey: "test-private-key" } };
});

function change(seatId: string, status: SeatStateChange["status"], previousStatus: SeatStateChange["previousStatus"]): SeatStateChange {
  return { seatId, status, confidence: 1, lastUpdatedAt: new Date(), verified: false, previousStatus };
}

describe("NotificationService", () => {
  let db: Db;
  let svc: NotificationService;
  let roomId: string;
  let seatIds: string[];

  beforeEach(async () => {
    sendNotification.mockClear();
    sendNotification.mockResolvedValue(undefined);

    db = await freshDb();
    svc = new NotificationService(db, new PushService(db), new RoomStateService(db));
    const room = await getRoom(db);
    roomId = room.id;
    seatIds = (await getSeats(db)).map((s) => s.id);
    await insertUsers(db, ["subscriber", "checked-in-subscriber", "not-subscribed", "admin1", "admin2"]);
    await db
      .insert(schema.notificationPreferences)
      .values([
        { userId: "subscriber", seatFreed: true },
        { userId: "checked-in-subscriber", seatFreed: true },
      ]);
  });

  async function addPushSubscription(userId: string, endpoint = `https://fcm.googleapis.com/fcm/send/${userId}`) {
    await db.insert(schema.pushSubscriptions).values({ userId, endpoint, p256dh: "p256dh", auth: "auth" });
  }

  async function addActiveCheckIn(userId: string, seatId: string) {
    await db.insert(schema.checkIns).values({
      userId,
      roomId,
      seatId,
      status: "ACTIVE",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
  }

  describe("handleSeatFreed", () => {
    it("ignores changes that aren't a freeing transition", async () => {
      await addPushSubscription("subscriber");
      const recipients = await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "OCCUPIED", "FREE"), change(seatIds[1]!, "FREE", null)]);
      expect(recipients).toEqual([]);
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("notifies a subscriber without an active check-in in the room, but not a checked-in subscriber", async () => {
      await addPushSubscription("subscriber");
      await addActiveCheckIn("checked-in-subscriber", seatIds[1]!);

      const recipients = await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);

      expect(recipients).toEqual([{ userId: "subscriber", seatIds: [seatIds[0]] }]);
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("never notifies a user who hasn't opted in", async () => {
      await addPushSubscription("not-subscribed");
      const recipients = await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "UNCERTAIN")]);
      expect(recipients.map((r) => r.userId)).not.toContain("not-subscribed");
      expect(sendNotification).not.toHaveBeenCalled(); // no subscribed user has a push subscription in this test
    });

    it("batches several seats freeing in the same tick into one push with a combined message", async () => {
      await addPushSubscription("subscriber");
      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED"), change(seatIds[1]!, "FREE", "UNCERTAIN")]);

      expect(sendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string);
      expect(payload.title).toBe("Se liberaron 2 lugares");
    });

    it("throttles: a second freed seat within 10 minutes doesn't push again to the same user", async () => {
      await addPushSubscription("subscriber");
      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);
      expect(sendNotification).toHaveBeenCalledTimes(1);

      const recipients = await svc.handleSeatFreed(roomId, [change(seatIds[1]!, "FREE", "OCCUPIED")]);
      // Still an eligible in-app recipient — only the push is throttled.
      expect(recipients).toContainEqual({ userId: "subscriber", seatIds: [seatIds[1]] });
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("deletes a subscription the push service reports gone (410)", async () => {
      await addPushSubscription("subscriber");
      sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));

      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);

      const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, "subscriber"));
      expect(rows).toHaveLength(0);
    });
  });

  describe("notifyAdminPresent", () => {
    beforeEach(async () => {
      await db.update(schema.notificationPreferences).set({ adminPresent: true }).where(eq(schema.notificationPreferences.userId, "subscriber"));
      await db.insert(schema.notificationPreferences).values({ userId: "admin1", adminPresent: true });
    });

    it("notifies subscribers other than the admin who just checked in", async () => {
      await addPushSubscription("subscriber");
      await addPushSubscription("admin1");

      await svc.notifyAdminPresent(roomId, "admin1");

      expect(sendNotification).toHaveBeenCalledTimes(1); // admin1 never notifies themself
    });

    it("throttles a second admin check-in within 60 minutes", async () => {
      await addPushSubscription("subscriber");
      await svc.notifyAdminPresent(roomId, "admin2");
      expect(sendNotification).toHaveBeenCalledTimes(1);

      await svc.notifyAdminPresent(roomId, "admin2");
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });
  });
});
