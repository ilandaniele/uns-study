import { AwsClient } from "aws4fetch";
import { env, type Env } from "../env.js";

const PUT_EXPIRY_SECONDS = 5 * 60;
const GET_EXPIRY_SECONDS = 60;

export interface PresignedPut {
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface HeadResult {
  size: number;
  contentType: string | null;
}

/**
 * Thin wrapper around Cloudflare R2 for report evidence. Presigned URLs are SigV4 query-signed with
 * the R2 S3 keys (`aws4fetch`); `head` and `deleteObject` go through the `EVIDENCE` binding. Object
 * keys never carry user information - `evidence/<random uuid>`.
 */
export class StorageService {
  private client: AwsClient | null = null;

  constructor(
    private readonly bucket: R2Bucket | null,
    private readonly e: Env = env,
  ) {}

  /** True when the binding and all R2 presign settings are configured. */
  isEnabled(): boolean {
    return Boolean(
      this.bucket && this.e.r2AccountId && this.e.r2AccessKeyId && this.e.r2SecretAccessKey && this.e.r2Bucket,
    );
  }

  private getClient(): AwsClient {
    this.client ??= new AwsClient({
      accessKeyId: this.e.r2AccessKeyId,
      secretAccessKey: this.e.r2SecretAccessKey,
      service: "s3",
      region: "auto",
    });
    return this.client;
  }

  private objectUrl(objectKey: string, expiresInSeconds: number): URL {
    const url = new URL(`https://${this.e.r2AccountId}.r2.cloudflarestorage.com/${this.e.r2Bucket}/${objectKey}`);
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    return url;
  }

  /** Presigns a 5-minute PUT for a fresh `evidence/<uuid>` object key. */
  async presignPut(contentType: string, contentLength: number): Promise<PresignedPut> {
    const objectKey = `evidence/${crypto.randomUUID()}`;
    const headers = { "Content-Type": contentType, "Content-Length": String(contentLength) };
    // `allHeaders` makes the signature cover content-type/content-length (aws4fetch skips them by
    // default), so a caller cannot swap them out after presigning (e.g. a much larger or
    // differently-typed file).
    const signed = await this.getClient().sign(this.objectUrl(objectKey, PUT_EXPIRY_SECONDS), {
      method: "PUT",
      headers,
      aws: { signQuery: true, allHeaders: true },
    });
    return {
      objectKey,
      uploadUrl: signed.url,
      headers,
      expiresAt: new Date(Date.now() + PUT_EXPIRY_SECONDS * 1000),
    };
  }

  /** Presigns a 60-second GET for moderation review. */
  async presignGet(objectKey: string): Promise<string> {
    const signed = await this.getClient().sign(this.objectUrl(objectKey, GET_EXPIRY_SECONDS), {
      method: "GET",
      aws: { signQuery: true },
    });
    return signed.url;
  }

  /** Verifies the object was actually uploaded; returns `null` if it doesn't exist. */
  async head(objectKey: string): Promise<HeadResult | null> {
    if (!this.bucket) return null;
    try {
      const object = await this.bucket.head(objectKey);
      if (!object) return null;
      return { size: object.size, contentType: object.httpMetadata?.contentType ?? null };
    } catch {
      return null;
    }
  }

  /** Deletes an object - used when a completed upload fails validation, or by the pending-attachment sweep. */
  async deleteObject(objectKey: string): Promise<void> {
    await this.bucket?.delete(objectKey);
  }
}
