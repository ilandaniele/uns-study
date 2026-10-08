import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
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
// `scheduleAdminPresent`'s delay is normally a random 2-5 minutes (`node:crypto`'s `randomInt`) —
// pinned to a fixed default here so timer-advancing tests are deterministic; individual tests
// override it with `mockReturnValueOnce` where the exact delay matters.
const { randomInt } = vi.hoisted(() => ({ randomInt: vi.fn(() => 3 * 60_000) }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt };
});
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
    randomInt.mockClear();

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

    it("never sends twice for the same throttle window even if two calls race concurrently", async () => {
      await addPushSubscription("subscriber");
      await Promise.all([svc.notifyAdminPresent(roomId, "admin2"), svc.notifyAdminPresent(roomId, "admin2")]);
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe("scheduleAdminPresent", () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await db.update(schema.notificationPreferences).set({ adminPresent: true }).where(eq(schema.notificationPreferences.userId, "subscriber"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fires the banner + push only after the delay, and only if the admin is still checked in", async () => {
      await addPushSubscription("subscriber");
      await addActiveCheckIn("admin1", seatIds[0]!);
      const emitBanner = vi.fn();

      svc.scheduleAdminPresent(roomId, "admin1", emitBanner);
      expect(emitBanner).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(emitBanner).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("never fires if the admin already checked out before the timer runs", async () => {
      const emitBanner = vi.fn();
      svc.scheduleAdminPresent(roomId, "admin1", emitBanner); // no active check-in inserted for admin1

      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(emitBanner).not.toHaveBeenCalled();
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("a repeated fresh check-in by the same admin reschedules instead of stacking a second timer", async () => {
      await addActiveCheckIn("admin1", seatIds[0]!);
      const emitBanner = vi.fn();
      randomInt.mockReturnValueOnce(4 * 60_000).mockReturnValueOnce(2 * 60_000);

      svc.scheduleAdminPresent(roomId, "admin1", emitBanner); // would fire at t=4min if left alone
      await vi.advanceTimersByTimeAsync(3 * 60_000); // t=3min — before the first timer's mark
      svc.scheduleAdminPresent(roomId, "admin1", emitBanner); // clears it, reschedules 2min from t=3min

      await vi.advanceTimersByTimeAsync(1 * 60_000); // t=4min — first timer's original mark, now moot
      expect(emitBanner).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1 * 60_000); // t=5min — the rescheduled timer's mark
      expect(emitBanner).toHaveBeenCalledTimes(1);
    });
  });

  describe("notifySeatChallenged", () => {
    const base = () => ({ userId: "not-subscribed", roomId, seatId: seatIds[0]!, seatCode: "M01-S01" });

    it("pushes by default (no preferences row) with the copy for each reason", async () => {
      await addPushSubscription("not-subscribed");
      const titles: Record<string, string> = {
        dispute: "Están reclamando tu lugar",
        "marked-free-vote": "Marcaron tu lugar como libre",
        lost: "Perdiste tu lugar",
      };
      for (const reason of ["dispute", "marked-free-vote", "lost"] as const) {
        sendNotification.mockClear();
        await svc.notifySeatChallenged({ ...base(), reason });
        expect(sendNotification).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string);
        expect(payload.title).toBe(titles[reason]);
        expect(payload.tag).toBe(`seat-challenge-${seatIds[0]}`);
      }
    });

    it("respects checkinExpiry = false", async () => {
      await addPushSubscription("not-subscribed");
      await db.insert(schema.notificationPreferences).values({ userId: "not-subscribed", checkinExpiry: false });
      await svc.notifySeatChallenged({ ...base(), reason: "marked-free-vote" });
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("throttles bare reports (marked-free / saved-challenged) per seat, never votes", async () => {
      await addPushSubscription("not-subscribed");
      await svc.notifySeatChallenged({ ...base(), reason: "marked-free" });
      await svc.notifySeatChallenged({ ...base(), reason: "saved-challenged" });
      expect(sendNotification).toHaveBeenCalledTimes(1);
      await svc.notifySeatChallenged({ ...base(), reason: "marked-free-vote" });
      expect(sendNotification).toHaveBeenCalledTimes(2);
    });

    it("is a no-op for a user without a push subscription", async () => {
      await expect(svc.notifySeatChallenged({ ...base(), reason: "lost" })).resolves.toBeUndefined();
      expect(sendNotification).not.toHaveBeenCalled();
    });
  });

  describe("notifyDirectMessage", () => {
    it("pushes the sender's name, a truncated body and the DM route to the recipient only", async () => {
      await addPushSubscription("subscriber");
      await addPushSubscription("not-subscribed", "https://fcm.googleapis.com/fcm/send/other");

      await svc.notifyDirectMessage({ recipientId: "subscriber", senderDisplayName: "Zorro Veloz", conversationId: "conv-1", content: "x".repeat(300) });

      expect(sendNotification).toHaveBeenCalledTimes(1);
      const [subscription, raw] = sendNotification.mock.calls[0]! as unknown as [{ endpoint: string }, string];
      expect(subscription.endpoint).toContain("subscriber");
      const payload = JSON.parse(raw);
      expect(payload.title).toBe("Zorro Veloz");
      expect(payload.body.length).toBeLessThanOrEqual(120);
      expect(payload.url).toBe("/chat/dm/conv-1");
      expect(payload.tag).toBe("dm-conv-1");
    });

    it("falls back to a generic title when the sender name is empty", async () => {
      await addPushSubscription("subscriber");
      await svc.notifyDirectMessage({ recipientId: "subscriber", senderDisplayName: " ", conversationId: "c", content: "hola" });
      expect(JSON.parse(sendNotification.mock.calls[0]![1] as string).title).toBe("Nuevo mensaje privado");
    });
  });
});
