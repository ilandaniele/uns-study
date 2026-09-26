import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

const PUT_EXPIRY_SECONDS = 5 * 60;
const GET_EXPIRY_SECONDS = 60;

export interface PresignedPut {
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface HeadResult {
  contentType: string | null;
  contentLength: number | null;
}

/**
 * Thin wrapper around Cloudflare R2 (S3-compatible) for report evidence. Object keys never carry
 * user information — `evidence/<random uuid>`.
 */
@Injectable()
export class StorageService {
  private client: S3Client | null = null;

  /** True when all R2 env vars are configured. */
  isEnabled(): boolean {
    return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket && env.r2Endpoint);
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: "auto",
        endpoint: env.r2Endpoint,
        credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
      });
    }
    return this.client;
  }

  /** Presigns a 5-minute PUT for a fresh `evidence/<uuid>` object key. */
  async presignPut(contentType: string, contentLength: number): Promise<PresignedPut> {
    const objectKey = `evidence/${randomUUID()}`;
    const command = new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    const uploadUrl = await getSignedUrl(this.getClient(), command, { expiresIn: PUT_EXPIRY_SECONDS });
    return {
      objectKey,
      uploadUrl,
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + PUT_EXPIRY_SECONDS * 1000).toISOString(),
    };
  }

  /** Presigns a 60-second GET for moderation review. */
  async presignGet(objectKey: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: env.r2Bucket, Key: objectKey });
    return getSignedUrl(this.getClient(), command, { expiresIn: GET_EXPIRY_SECONDS });
  }

  /** Verifies the object was actually uploaded; returns `null` if it doesn't exist. */
  async head(objectKey: string): Promise<HeadResult | null> {
    try {
      const result = await this.getClient().send(new HeadObjectCommand({ Bucket: env.r2Bucket, Key: objectKey }));
      return { contentType: result.ContentType ?? null, contentLength: result.ContentLength ?? null };
    } catch {
      return null;
    }
  }
}
