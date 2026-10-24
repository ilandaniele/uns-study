import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq, sql } from "drizzle-orm";
import { createECDH } from "node:crypto";
import { env } from "../env.js";
import { freshDb, getRoom, getSeats, insertUsers } from "../test-utils.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { ManualScheduler } from "../platform/scheduler.js";
import { FixedClock } from "../platform/clock.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { SeatWatchService } from "../seat-watch/seat-watch.service.js";
import { QuietRoomService } from "../quiet-room/quiet-room.service.js";
import { PushService } from "./push.service.js";
import { NotificationService } from "./notification.service.js";

const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(async (_subscription: unknown, _payload?: string) => undefined),
}));
// `buildPushHTTPRequest` (VAPID JWT + aes128gcm) is replaced by a stub that echoes the JSON payload
// as the body; the stubbed `fetch` forwards each request to `sendNotification`.
vi.mock("@pushforge/builder", () => ({
  buildPushHTTPRequest: vi.fn(async (opts: { subscription: { endpoint: string }; message: { payload: unknown } }) => ({
    endpoint: opts.subscription.endpoint,
    headers: new Headers(),
    body: JSON.stringify(opts.message.payload),
  })),
}));
// `scheduleAdminPresent`'s delay is normally a random 2-5 minutes (`node:crypto`'s `randomInt`) -
// pinned to a fixed default here so the scheduled due time is deterministic; individual tests
// override it with `mockReturnValueOnce` where the exact delay matters.
const { randomInt } = vi.hoisted(() => ({ randomInt: vi.fn(() => 3 * 60_000) }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt };
});

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

function change(seatId: string, status: SeatStateChange["status"], previousStatus: SeatStateChange["previousStatus"]): SeatStateChange {
  return { seatId, status, confidence: 1, lastUpdatedAt: new Date(), verified: false, previousStatus };
}

describe("NotificationService", () => {
  let db: Db;
  let svc: NotificationService;
  let scheduler: ManualScheduler;
  let roomId: string;
  let seatIds: string[];

  beforeEach(async () => {
    sendNotification.mockClear();
    sendNotification.mockResolvedValue(undefined);
    randomInt.mockClear();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        try {
          await sendNotification({ endpoint: url }, init.body);
          return new Response(null, { status: 201 });
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode) return new Response(null, { status: statusCode });
          throw err;
        }
      }),
    );
    env.vapidPublicKey = ecdh.getPublicKey().toString("base64url");
    env.vapidPrivateKey = ecdh.getPrivateKey().toString("base64url");

    db = freshDb();
    scheduler = new ManualScheduler();
    svc = new NotificationService(db, new PushService(db), new RoomStateService(db), scheduler);
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

  afterEach(() => {
    vi.unstubAllGlobals();
    env.vapidPublicKey = "";
    env.vapidPrivateKey = "";
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

  it("vote invitations are scoped to the occupied room and can exclude participants", async () => {
    await addActiveCheckIn("checked-in-subscriber", seatIds[0]!);
    expect(svc.disputeVoters(roomId, [])).toEqual(["checked-in-subscriber"]);
    expect(svc.disputeVoters("another-room", [])).toEqual([]);
    expect(svc.disputeVoters(roomId, ["checked-in-subscriber"])).toEqual([]);
  });

  it("does not send a vote push after its deadline", async () => {
    await addPushSubscription("subscriber");
    const result = await new PushService(db).sendToUser("subscriber", { title: "Votación", body: "Votá", url: "/sala/principal", tag: "vote", expiresAt: "2000-01-01T00:00:00Z" });
    expect(result).toBeNull();
    expect(sendNotification).not.toHaveBeenCalled();
  });

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

    it("claims no throttle row for an opted-in user without a push subscription", async () => {
      const recipients = await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);
      expect(recipients.map((r) => r.userId)).toContain("subscriber"); // still gets the in-app alert
      expect(await db.select().from(schema.notificationThrottles)).toHaveLength(0);
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

  describe("handleSeatFreed with seat watches", () => {
    let watches: SeatWatchService;

    beforeEach(async () => {
      const roomState = new RoomStateService(db);
      watches = new SeatWatchService(db, new RoomsService(db, roomState), new FixedClock(new Date()));
      svc = new NotificationService(db, new PushService(db), roomState, scheduler, watches);
      await insertUsers(db, ["watcher"]);
    });

    async function addWatch(userId: string, ids: string[]) {
      await db.insert(schema.seatWatches).values({ userId, roomId, seatIds: JSON.stringify(ids), expiresAt: new Date(Date.now() + 3_600_000) });
    }

    it("pushes the watch copy once and skips the generic push for that user", async () => {
      await db.insert(schema.notificationPreferences).values({ userId: "watcher", seatFreed: true });
      await addPushSubscription("watcher");
      await addWatch("watcher", [seatIds[0]!]);

      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);

      expect(sendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string);
      expect(payload.title).toBe("Se liberó un lugar que estabas esperando");
      expect(payload.tag).toBe("seat-watch");
      expect(payload.url).toContain(`?seat=${seatIds[0]}`);
      expect(await db.select().from(schema.seatWatches)).toHaveLength(0);
    });

    it("still sends the generic push to other subscribers", async () => {
      await addPushSubscription("subscriber");
      await addPushSubscription("watcher");
      await addWatch("watcher", [seatIds[0]!]);

      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);

      expect(sendNotification).toHaveBeenCalledTimes(2);
      const tags = sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string).tag).sort();
      expect(tags).toEqual(["seat-freed", "seat-watch"]);
    });

    it("does not push a watcher checked into the room, but still deletes the fulfilled watch", async () => {
      await addPushSubscription("watcher");
      await addActiveCheckIn("watcher", seatIds[1]!);
      await addWatch("watcher", [seatIds[0]!]);

      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);

      expect(sendNotification).not.toHaveBeenCalled();
      expect(await db.select().from(schema.seatWatches)).toHaveLength(0);
    });

    it("keeps a watch whose seats did not free up", async () => {
      await addPushSubscription("watcher");
      await addWatch("watcher", [seatIds[2]!]);
      await svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")]);
      expect(sendNotification).not.toHaveBeenCalled();
      expect(await db.select().from(schema.seatWatches)).toHaveLength(1);
    });

    it("still sends generic pushes without throwing when the table is missing", async () => {
      await db.run(sql`DROP TABLE seat_watches`);
      await addPushSubscription("subscriber");

      await expect(svc.handleSeatFreed(roomId, [change(seatIds[0]!, "FREE", "OCCUPIED")])).resolves.toBeDefined();

      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(JSON.parse(sendNotification.mock.calls[0]![1] as string).tag).toBe("seat-freed");
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
      await db.update(schema.notificationPreferences).set({ adminPresent: true }).where(eq(schema.notificationPreferences.userId, "subscriber"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("schedules a one-shot `admin-present:<adminUserId>` job 2-5 minutes out with the room payload", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

      svc.scheduleAdminPresent(roomId, "admin1");

      expect(scheduler.get("admin-present:admin1")).toEqual({
        dueAt: new Date("2026-01-01T12:03:00Z"),
        payload: { roomId, adminUserId: "admin1" },
      });
      expect(randomInt).toHaveBeenCalledWith(2 * 60_000, 5 * 60_000);
    });

    it("fires the banner + push through fireAdminPresent while the admin is still checked in", async () => {
      await addPushSubscription("subscriber");
      await addActiveCheckIn("admin1", seatIds[0]!);
      const emitBanner = vi.fn();

      await svc.fireAdminPresent(roomId, "admin1", emitBanner);

      expect(emitBanner).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    it("never fires if the admin already checked out before the job runs", async () => {
      const emitBanner = vi.fn();
      await svc.fireAdminPresent(roomId, "admin1", emitBanner); // no active check-in inserted for admin1

      expect(emitBanner).not.toHaveBeenCalled();
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it("a repeated fresh check-in by the same admin replaces the pending job instead of stacking a second one", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      randomInt.mockReturnValueOnce(4 * 60_000).mockReturnValueOnce(2 * 60_000);

      svc.scheduleAdminPresent(roomId, "admin1"); // would fire at 12:04
      vi.setSystemTime(new Date("2026-01-01T12:03:00Z"));
      svc.scheduleAdminPresent(roomId, "admin1"); // replaces it: 12:05

      expect(scheduler.get("admin-present:admin1")?.dueAt).toEqual(new Date("2026-01-01T12:05:00Z"));
      expect(scheduler.nextDueAt()).toEqual(new Date("2026-01-01T12:05:00Z"));
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

  describe("handleQuietRoom", () => {
    const NOW = new Date();
    const summary = { roomId: "", total: 100, free: 60, occupied: 40, uncertain: 0, saved: 0, unknown: 0 };
    // 4 seats stopped being occupied: 44 % -> 40 %.
    const drop = () => [0, 1, 2, 3].map((i) => change(seatIds[i]!, "FREE", "OCCUPIED"));
    let watches: QuietRoomService;

    beforeEach(async () => {
      const roomState = new RoomStateService(db);
      watches = new QuietRoomService(db, new RoomsService(db, roomState), new FixedClock(NOW));
      svc = new NotificationService(db, new PushService(db), roomState, scheduler, null, watches);
      await insertUsers(db, ["qwatcher"]);
    });

    async function addQuietWatch(userId: string, thresholdPct: number) {
      await db.insert(schema.quietRoomWatches).values({ userId, roomId, thresholdPct, expiresAt: new Date(NOW.getTime() + 3_600_000) });
    }

    it("pushes a subscribed watcher once and returns the in-app event", async () => {
      await addPushSubscription("qwatcher");
      await addQuietWatch("qwatcher", 42);

      const recipients = await svc.handleQuietRoom(roomId, { ...summary, roomId }, drop());

      expect(recipients).toHaveLength(1);
      expect(recipients[0]!.userId).toBe("qwatcher");
      expect(recipients[0]!.event).toMatchObject({ roomId, thresholdPct: 42, occupancyPct: 40, free: 60 });
      expect(sendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string);
      expect(payload.tag).toBe("quiet-room");
      expect(payload.body).toBe("Está al 40 % ocupada: hay 60 lugares libres.");
      expect(await db.select().from(schema.quietRoomWatches)).toHaveLength(0);
    });

    it("consumes the watch of a checked-in user without push or recipient", async () => {
      await addPushSubscription("qwatcher");
      await addActiveCheckIn("qwatcher", seatIds[10]!);
      await addQuietWatch("qwatcher", 42);

      expect(await svc.handleQuietRoom(roomId, { ...summary, roomId }, drop())).toEqual([]);
      expect(sendNotification).not.toHaveBeenCalled();
      expect(await db.select().from(schema.quietRoomWatches)).toHaveLength(0);
    });

    it("keeps the watch when occupancy did not cross it (or rose, or the room is small)", async () => {
      await addQuietWatch("qwatcher", 30);
      expect(await svc.handleQuietRoom(roomId, { ...summary, roomId }, drop())).toEqual([]);
      expect(await svc.handleQuietRoom(roomId, { ...summary, roomId }, [change(seatIds[0]!, "OCCUPIED", "FREE")])).toEqual([]);
      expect(await svc.handleQuietRoom(roomId, { ...summary, roomId, total: 10 }, drop())).toEqual([]);
      expect(await db.select().from(schema.quietRoomWatches)).toHaveLength(1);
    });

    it("does not query at all without a crossing", async () => {
      const spy = vi.spyOn(watches, "claimCrossed");
      await svc.handleQuietRoom(roomId, { ...summary, roomId }, [change(seatIds[0]!, "OCCUPIED", "FREE")]);
      expect(spy).not.toHaveBeenCalled();
    });

    it("returns [] without throwing when the table is missing", async () => {
      await db.run(sql`DROP TABLE quiet_room_watches`);
      await expect(svc.handleQuietRoom(roomId, { ...summary, roomId }, drop())).resolves.toEqual([]);
    });
  });
});
