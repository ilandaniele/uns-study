import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { Db } from "@sala/database";
import { schema } from "@sala/database";
import { freshDb, insertUsers } from "../test-utils.js";
import { RestrictionService } from "../users/restriction.service.js";
import type { RateLimitService } from "../security/rate-limit.service.js";
import type { RequestUser } from "../auth/request-user.js";
import { AvatarsService } from "./avatars.service.js";
import { PublicAvatarController } from "./avatars.controller.js";

const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");

function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    statusCode: 0,
    body: undefined as unknown,
    setHeader: (k: string, v: string) => void (headers[k] = v),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(b: unknown) {
      res.body = b;
    },
    end: vi.fn(),
  };
  return res;
}

const viewer = (id: string): RequestUser => ({ id, name: id, email: `${id}@x.test`, image: null });

describe("PublicAvatarController", () => {
  let db: Db;
  let ctrl: PublicAvatarController;

  beforeEach(async () => {
    db = await freshDb();
    await insertUsers(db, ["u1", "u2"]);
    const avatars = new AvatarsService(db, new RestrictionService(db));
    await avatars.upload("u1", { mimeType: "image/jpeg", base64: JPEG_BASE64 });
    const rateLimit = { check: async () => ({ allowed: true }) } as unknown as RateLimitService;
    ctrl = new PublicAvatarController(avatars, rateLimit);
  });

  it("serves the owner their hidden photo with private/Vary: Cookie headers", async () => {
    const res = fakeRes();
    await ctrl.get("u1", viewer("u1"), "1.1.1.1", undefined, undefined, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("private, no-cache");
    expect(res.headers["Vary"]).toBe("Cookie");
  });

  it("404s anonymous and other users while show_avatar is off", async () => {
    await expect(ctrl.get("u1", undefined, "1.1.1.1", undefined, undefined, fakeRes() as unknown as Response)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ctrl.get("u1", viewer("u2"), "1.1.1.1", undefined, undefined, fakeRes() as unknown as Response)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("serves others once show_avatar is on, still with private cache headers", async () => {
    await db.insert(schema.userPrivacySettings).values({ userId: "u1", showAvatar: true });
    const res = fakeRes();
    await ctrl.get("u1", viewer("u2"), "1.1.1.1", undefined, undefined, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("private, no-cache");
    expect(res.headers["Vary"]).toBe("Cookie");
  });

  it("sends immutable caching when v matches the current content hash", async () => {
    const sha = createHash("sha256").update(Buffer.from(JPEG_BASE64, "base64")).digest("hex").slice(0, 12);
    const res = fakeRes();
    await ctrl.get("u1", viewer("u1"), "1.1.1.1", undefined, sha, res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("private, max-age=31536000, immutable");
    expect(res.headers["Vary"]).toBe("Cookie");
    expect(res.headers["ETag"]).toBeDefined();
  });

  it("keeps no-cache when v is missing or stale", async () => {
    const stale = fakeRes();
    await ctrl.get("u1", viewer("u1"), "1.1.1.1", undefined, "deadbeef0000", stale as unknown as Response);
    expect(stale.headers["Cache-Control"]).toBe("private, no-cache");
  });

  it("404s a hidden avatar for non-owners even with a matching v, without immutable", async () => {
    const sha = createHash("sha256").update(Buffer.from(JPEG_BASE64, "base64")).digest("hex").slice(0, 12);
    const res = fakeRes();
    await expect(ctrl.get("u1", viewer("u2"), "1.1.1.1", undefined, sha, res as unknown as Response)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(res.headers["Cache-Control"]).toBeUndefined();
  });
});
