import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { countRecipients, recipientsQuery } from "./email-recipients.js";

const NOW = new Date("2026-10-03T12:00:00Z");
const HOUR = 3_600_000;

describe("email recipients", () => {
  let db: Db;

  beforeEach(async () => {
    db = freshDb();
  });

  async function verify(...ids: string[]) {
    for (const id of ids) await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id));
  }

  async function ids(): Promise<string[]> {
    return (await recipientsQuery(db, NOW)).map((r) => r.userId).sort();
  }

  it("includes only verified emails", async () => {
    await insertUsers(db, ["verified", "unverified"]);
    await verify("verified");
    expect(await ids()).toEqual(["verified"]);
    expect(await countRecipients(db, NOW)).toBe(1);
  });

  it("excludes a user whose preferences row opted out, includes opted-in and missing rows", async () => {
    await insertUsers(db, ["out", "in", "none"]);
    await verify("out", "in", "none");
    await db.insert(schema.notificationPreferences).values([
      { userId: "out", marketingEmails: false },
      { userId: "in", marketingEmails: true },
    ]);
    expect(await ids()).toEqual(["in", "none"]);
  });

  it("excludes active SUSPENDED and BANNED restrictions", async () => {
    await insertUsers(db, ["susp", "banned", "muted", "ok"]);
    await verify("susp", "banned", "muted", "ok");
    await db.insert(schema.userRestrictions).values([
      { userId: "susp", type: "SUSPENDED", reason: "x", until: new Date(NOW.getTime() + HOUR) },
      { userId: "banned", type: "BANNED", reason: "x" },
      { userId: "muted", type: "MUTE_CHAT", reason: "x" },
    ]);
    expect(await ids()).toEqual(["muted", "ok"]);
  });

  it("includes users whose restriction was lifted or expired", async () => {
    await insertUsers(db, ["lifted", "expired"]);
    await verify("lifted", "expired");
    await db.insert(schema.userRestrictions).values([
      { userId: "lifted", type: "BANNED", reason: "x", liftedAt: new Date(NOW.getTime() - HOUR) },
      { userId: "expired", type: "SUSPENDED", reason: "x", until: new Date(NOW.getTime() - HOUR) },
    ]);
    expect(await ids()).toEqual(["expired", "lifted"]);
  });

  describe("audience", () => {
    beforeEach(async () => {
      await insertUsers(db, ["pro", "lapsed", "free"]);
      await verify("pro", "lapsed", "free");
      await db.insert(schema.userSubscriptions).values([
        { userId: "pro", providerSubscriptionId: "s1", status: "authorized" },
        { userId: "lapsed", providerSubscriptionId: "s2", status: "cancelled" },
      ]);
    });

    it("all keeps everyone eligible", async () => {
      expect((await recipientsQuery(db, NOW, "all")).map((r) => r.userId).sort()).toEqual(["free", "lapsed", "pro"]);
    });

    it("subscribers only reaches authorized subscriptions", async () => {
      expect((await recipientsQuery(db, NOW, "subscribers")).map((r) => r.userId)).toEqual(["pro"]);
      expect(await countRecipients(db, NOW, "subscribers")).toBe(1);
    });

    it("free reaches users without an authorized subscription, including lapsed ones", async () => {
      expect((await recipientsQuery(db, NOW, "free")).map((r) => r.userId).sort()).toEqual(["free", "lapsed"]);
      expect(await countRecipients(db, NOW, "free")).toBe(2);
    });

    it("still applies opt-out within an audience", async () => {
      await db.insert(schema.notificationPreferences).values({ userId: "pro", marketingEmails: false });
      expect(await countRecipients(db, NOW, "subscribers")).toBe(0);
    });
  });
});
