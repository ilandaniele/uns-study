import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@uns/database";
import { schema } from "@uns/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import { AvatarsService } from "./avatars.service.js";

// A minimal-but-valid JPEG signature (FF D8 FF ...) — enough to pass the magic-byte check without
// needing a real decodable image.
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");
const PNG_MAGIC_ONLY_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

describe("AvatarsService", () => {
  let db: Db;
  let svc: AvatarsService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new AvatarsService(db);
    await insertUsers(db, ["u1", "u2"]);
  });

  describe("upload", () => {
    it("stores the bytes and points user_profiles.avatar_url at the public avatar route", async () => {
      const url = await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });

      expect(url).toMatch(/^\/api\/v1\/avatars\/u1\?v=[0-9a-f]{12}$/);
      const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(profile?.avatarUrl).toBe(url);
      const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(row?.mimeType).toBe("image/jpeg");
      expect(Buffer.isBuffer(row?.bytes)).toBe(true);
      expect(row?.sha256).toHaveLength(64);
    });

    it("re-uploading replaces the stored bytes (upsert)", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      const secondJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03]).toString("base64");
      const url2 = await svc.upload("u1", { mimeType: "image/jpeg", base64: secondJpeg });

      const rows = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(rows).toHaveLength(1);
      const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(profile?.avatarUrl).toBe(url2);
    });

    it("rejects a payload larger than 300KB decoded", async () => {
      const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(300 * 1024)]);
      await expect(svc.upload("u1", { mimeType: "image/jpeg", base64: big.toString("base64") })).rejects.toMatchObject({
        code: "PHOTO_INVALID",
      });
    });

    it("rejects bytes whose magic number doesn't match the declared mime type", async () => {
      await expect(svc.upload("u1", { mimeType: "image/jpeg", base64: PNG_MAGIC_ONLY_BASE64 })).rejects.toMatchObject({
        code: "PHOTO_INVALID",
      });
    });
  });

  describe("getForOwner", () => {
    it("404s when the owner hasn't opted into show_avatar", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      await expect(svc.getForOwner("u1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("streams the bytes once show_avatar is on", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      await db.insert(schema.userPrivacySettings).values({ userId: "u1", showAvatar: true });

      const avatar = await svc.getForOwner("u1");
      expect(avatar.mimeType).toBe("image/jpeg");
      expect(avatar.bytes.length).toBeGreaterThan(0);
    });

    it("404s when there's no uploaded photo, even with show_avatar on", async () => {
      await db.insert(schema.userPrivacySettings).values({ userId: "u1", showAvatar: true });
      await expect(svc.getForOwner("u1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("remove", () => {
    it("deletes the stored bytes and clears avatar_url", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      await svc.remove("u1");

      const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(row).toBeUndefined();
      const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(profile?.avatarUrl).toBeNull();
    });
  });

  describe("useGoogleImage", () => {
    it("points avatar_url at the given https image and clears any uploaded bytes", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      const url = await svc.useGoogleImage("u1", "https://lh3.googleusercontent.com/a/photo.jpg");

      expect(url).toBe("https://lh3.googleusercontent.com/a/photo.jpg");
      const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(profile?.avatarUrl).toBe(url);
      const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(row).toBeUndefined();
    });

    it("rejects a non-https (or missing) Google image", async () => {
      await expect(svc.useGoogleImage("u2", null)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(svc.useGoogleImage("u2", "http://insecure.test/a.png")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });
});
