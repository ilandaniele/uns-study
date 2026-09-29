import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { AvatarMimeType } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { ApiErrors } from "../common/api-error.js";
import { stripImageMetadata } from "../common/image-metadata.js";

const MAX_AVATAR_BYTES = 300 * 1024;
const GOOGLE_IMAGE_HOSTNAME_SUFFIX = ".googleusercontent.com";
const GOOGLE_IMAGE_FETCH_TIMEOUT_MS = 5000;

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

/** Sniffs the mime type from magic bytes alone — used for the Google-fetched image, whose
 *  `Content-Type` response header can't be trusted any more than a client-declared one. */
function sniffMimeType(bytes: Buffer): AvatarMimeType | null {
  if (matchesMagicBytes(bytes, "image/jpeg")) return "image/jpeg";
  if (matchesMagicBytes(bytes, "image/png")) return "image/png";
  if (matchesMagicBytes(bytes, "image/webp")) return "image/webp";
  return null;
}

/** Builds the relative, cache-busted URL `user_profiles.avatar_url` points to for an uploaded photo. */
function avatarUrlFor(userId: string, sha256: string): string {
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

  /** Decodes/validates the upload, strips metadata, stores it, and points `avatar_url` at it. */
  async upload(userId: string, image: { mimeType: AvatarMimeType; base64: string }): Promise<string> {
    const bytes = decodeAndValidateAvatar(image);
    const stripped = stripImageMetadata(image.mimeType, bytes);
    return this.storeBytes(userId, image.mimeType, stripped);
  }

  /** Removes the stored photo (if any) and clears `avatar_url`. */
  async remove(userId: string): Promise<void> {
    await this.db.delete(schema.userAvatars).where(eq(schema.userAvatars.userId, userId));
    await this.setProfileAvatarUrl(userId, null);
  }

  /**
   * Points `avatar_url` at the caller's Google profile photo — only ever set via this explicit
   * action, never automatically. Rather than trusting (and directly linking to) an arbitrary
   * Google-hosted URL, this fetches the bytes itself and stores them through the same path as an
   * uploaded photo, so every avatar — Google or uploaded — is served from `/api/v1/avatars/:userId`.
   */
  async useGoogleImage(userId: string, googleImage: string | null): Promise<string> {
    const bytes = await this.fetchGoogleImageBytes(googleImage);
    const mimeType = sniffMimeType(bytes);
    if (!mimeType) throw ApiErrors.validation("No hay una foto de Google para usar.");
    const stripped = stripImageMetadata(mimeType, bytes);
    return this.storeBytes(userId, mimeType, stripped);
  }

  /** Fetches and size/type-validates a Google-hosted profile photo. Never trusts the caller-supplied
   *  URL beyond scheme + hostname: no redirects are followed, and the response is capped at
   *  `MAX_AVATAR_BYTES` regardless of what `Content-Length` claims. */
  private async fetchGoogleImageBytes(googleImage: string | null): Promise<Buffer> {
    if (!googleImage) throw ApiErrors.validation("No hay una foto de Google para usar.");
    let url: URL;
    try {
      url = new URL(googleImage);
    } catch {
      throw ApiErrors.validation("No hay una foto de Google para usar.");
    }
    if (url.protocol !== "https:" || !url.hostname.toLowerCase().endsWith(GOOGLE_IMAGE_HOSTNAME_SUFFIX)) {
      throw ApiErrors.validation("No hay una foto de Google para usar.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_IMAGE_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { redirect: "error", signal: controller.signal });
    } catch {
      throw ApiErrors.validation("No pudimos obtener la foto de Google.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !response.body) throw ApiErrors.validation("No pudimos obtener la foto de Google.");

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_AVATAR_BYTES) throw ApiErrors.photoInvalid();

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > MAX_AVATAR_BYTES) throw ApiErrors.photoInvalid();
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length === 0) throw ApiErrors.photoInvalid();
    return bytes;
  }

  /** Upserts the bytes into `user_avatars` and points `user_profiles.avatar_url` at the result —
   *  shared by both `upload` and `useGoogleImage` so every avatar is served the same way. */
  private async storeBytes(userId: string, mimeType: AvatarMimeType, bytes: Buffer): Promise<string> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const url = avatarUrlFor(userId, sha256);
    const now = new Date();

    await this.db
      .insert(schema.userAvatars)
      .values({ userId, mimeType, bytes, sha256, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.userAvatars.userId,
        set: { mimeType, bytes, sha256, updatedAt: now },
      });

    await this.setProfileAvatarUrl(userId, url);
    return url;
  }

  /** Bytes for `GET /avatars/:userId`, gated by the owner's `show_avatar` privacy setting
   *  (bypassed when `isOwner` — you can always see your own photo). Throws
   *  `NOT_FOUND` (never a distinguishable "hidden") whenever nothing should be served. */
  async getForOwner(userId: string, isOwner = false): Promise<AvatarBytes> {
    if (!isOwner) {
      const [privacy] = await this.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, userId)).limit(1);
      if (!privacy?.showAvatar) throw ApiErrors.notFound();
    }

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
