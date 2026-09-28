import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { AvatarMimeType } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";

const MAX_AVATAR_BYTES = 300 * 1024;

export interface AvatarBytes {
  mimeType: string;
  bytes: Buffer;
  sha256: string;
  updatedAt: Date;
}

/** JPEG/PNG/WEBP magic-byte signatures — a mismatch with the declared `mimeType` means the bytes
 *  don't actually contain what the client claims, regardless of what it said. */
function matchesMagicBytes(bytes: Buffer, mimeType: AvatarMimeType): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= sig.length && bytes.subarray(0, sig.length).equals(sig);
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function decodeAndValidateAvatar(image: { mimeType: AvatarMimeType; base64: string }): Buffer {
  const bytes = Buffer.from(image.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) throw ApiErrors.photoInvalid();
  if (!matchesMagicBytes(bytes, image.mimeType)) throw ApiErrors.photoInvalid();
  return bytes;
}

/** Builds the relative, cache-busted URL `user_profiles.avatar_url` points to for an uploaded photo. */
export function avatarUrlFor(userId: string, sha256: string): string {
  return `/api/v1/avatars/${userId}?v=${sha256.slice(0, 12)}`;
}

/**
 * Owns the `user_avatars` bytes table and the `user_profiles.avatar_url` field it feeds. Photo
 * bytes never leave this service except through `getForOwner`, which the public `/avatars/:userId`
 * route gates on the owner's `show_avatar` privacy setting.
 */
@Injectable()
export class AvatarsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Decodes/validates the upload, stores it, and points `user_profiles.avatar_url` at it. */
  async upload(userId: string, image: { mimeType: AvatarMimeType; base64: string }): Promise<string> {
    const bytes = decodeAndValidateAvatar(image);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const url = avatarUrlFor(userId, sha256);
    const now = new Date();

    await this.db
      .insert(schema.userAvatars)
      .values({ userId, mimeType: image.mimeType, bytes, sha256, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.userAvatars.userId,
        set: { mimeType: image.mimeType, bytes, sha256, updatedAt: now },
      });

    await this.setProfileAvatarUrl(userId, url);
    return url;
  }

  /** Removes the stored photo (if any) and clears `avatar_url`. */
  async remove(userId: string): Promise<void> {
    await this.db.delete(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
    await this.setProfileAvatarUrl(userId, null);
  }

  /** Points `avatar_url` at the caller's Better Auth (Google) profile photo — only ever set via this
   *  explicit action, never automatically. Clears any previously uploaded photo bytes. */
  async useGoogleImage(userId: string, googleImage: string | null): Promise<string> {
    if (!googleImage || !googleImage.startsWith("https://")) throw ApiErrors.validation("No hay una foto de Google para usar.");
    await this.db.delete(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
    await this.setProfileAvatarUrl(userId, googleImage);
    return googleImage;
  }

  /** Bytes for `GET /avatars/:userId`, gated by the owner's `show_avatar` privacy setting. Throws
   *  `NOT_FOUND` (never a distinguishable "hidden") whenever nothing should be served. */
  async getForOwner(userId: string): Promise<AvatarBytes> {
    const [privacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, userId)).limit(1);
    if (!privacy?.showAvatar) throw ApiErrors.notFound();

    const [row] = await this.db.select().from(schema.userAvatars).where(eq(schema.userAvatars.userId, userId)).limit(1);
    if (!row) throw ApiErrors.notFound();

    return { mimeType: row.mimeType, bytes: row.bytes, sha256: row.sha256, updatedAt: row.updatedAt };
  }

  private async setProfileAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
    await this.db.insert(schema.userProfiles).values({ userId, avatarUrl }).onConflictDoUpdate({
      target: schema.userProfiles.userId,
      set: { avatarUrl, updatedAt: new Date() },
    });
  }
}
