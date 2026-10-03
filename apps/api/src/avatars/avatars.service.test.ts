import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { eq } from "drizzle-orm";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import { AvatarsService } from "./avatars.service.js";

// A minimal-but-valid JPEG signature (FF D8 FF ...) — enough to pass the magic-byte check without
// needing a real decodable image.
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");
const PNG_MAGIC_ONLY_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** Stubs `global.fetch` to resolve once with the given bytes, mimicking the `Response` shape this
 *  service actually reads from (`ok`, `headers.get`, and an async-iterable `body`). */
function stubFetchOnce(bytes: Buffer, opts: { ok?: boolean; contentLength?: number } = {}): void {
  const { ok = true, contentLength } = opts;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      headers: { get: (name: string) => (name === "content-length" ? (contentLength ?? bytes.length).toString() : null) },
      body: (async function* () {
        yield bytes;
      })(),
    })),
  );
}

describe("AvatarsService", () => {
  let db: Db;
  let svc: AvatarsService;

  beforeEach(async () => {
    db = await freshDb();
    svc = new AvatarsService(db, new RestrictionService(db));
    await insertUsers(db, ["u1", "u2"]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

    it("strips embedded metadata (e.g. EXIF) before storing", async () => {
      const exifPayload = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from("GPS secret")]);
      const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), lengthBytes(exifPayload.length + 2), exifPayload]);
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])]);

      await svc.upload("u1", { mimeType: "image/jpeg", base64: jpeg.toString("base64") });
      const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(row!.bytes.includes("GPS secret")).toBe(false);
    });
  });

  describe("restrictions", () => {
    it("blocks upload and use-Google-image for SUSPENDED/BANNED users", async () => {
      await db.insert(schema.userRestrictions).values({ userId: "u1", type: "BANNED", reason: "t" });
      await db.insert(schema.userRestrictions).values({ userId: "u2", type: "SUSPENDED", reason: "t" });
      await expect(svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 })).rejects.toMatchObject({ code: "RESTRICTED" });
      await expect(svc.useGoogleImage("u2", "https://lh3.googleusercontent.com/a")).rejects.toMatchObject({ code: "RESTRICTED" });
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

    it("serves the owner their own photo even while show_avatar is off", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      const avatar = await svc.getForOwner("u1", true);
      expect(avatar.bytes.length).toBeGreaterThan(0);
      await expect(svc.getForOwner("u1", false)).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    it("fetches the bytes server-side and stores them through the same route as an upload", async () => {
      stubFetchOnce(JPEG_BYTES);
      const url = await svc.useGoogleImage("u1", "https://lh3.googleusercontent.com/a/photo.jpg");

      expect(url).toMatch(/^\/api\/v1\/avatars\/u1\?v=[0-9a-f]{12}$/);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ href: "https://lh3.googleusercontent.com/a/photo.jpg" }),
        expect.objectContaining({ redirect: "error" }),
      );
      const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "u1"));
      expect(profile?.avatarUrl).toBe(url);
      const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(row?.mimeType).toBe("image/jpeg");
    });

    it("replaces previously stored bytes with the freshly fetched Google photo", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      const newer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x02, 0x03]);
      stubFetchOnce(newer);
      const url = await svc.useGoogleImage("u1", "https://lh3.googleusercontent.com/a/photo.jpg");

      const [row] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(row?.bytes.equals(newer)).toBe(true);
      expect(url).toContain(row!.sha256.slice(0, 12));
    });

    it("throws (no silent success) and keeps the old photo when the Google fetch fails", async () => {
      await svc.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
      const [before] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
      await expect(svc.useGoogleImage("u1", "https://lh3.googleusercontent.com/a/photo.jpg")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      stubFetchOnce(JPEG_BYTES, { ok: false });
      await expect(svc.useGoogleImage("u1", "https://lh3.googleusercontent.com/a/photo.jpg")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      const [after] = await db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, "u1"));
      expect(after?.sha256).toBe(before?.sha256);
    });

    it("rejects a non-https (or missing) Google image without ever fetching", async () => {
      stubFetchOnce(JPEG_BYTES);
      await expect(svc.useGoogleImage("u2", null)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(svc.useGoogleImage("u2", "http://insecure.test/a.png")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects a URL whose host isn't a googleusercontent.com subdomain", async () => {
      stubFetchOnce(JPEG_BYTES);
      await expect(svc.useGoogleImage("u2", "https://evil.test/photo.jpg")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects a response larger than the avatar size cap", async () => {
      stubFetchOnce(JPEG_BYTES, { contentLength: 400 * 1024 });
      await expect(svc.useGoogleImage("u2", "https://lh3.googleusercontent.com/a/photo.jpg")).rejects.toMatchObject({ code: "PHOTO_INVALID" });
    });

    it("rejects bytes that don't match any known image signature", async () => {
      stubFetchOnce(Buffer.from([0x00, 0x01, 0x02, 0x03]));
      await expect(svc.useGoogleImage("u2", "https://lh3.googleusercontent.com/a/photo.jpg")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });
});

function lengthBytes(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}
