import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { StorageService } from "./storage.service.js";

const ENV = loadEnv({
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "AKID",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
});

function fakeBucket() {
  return { head: vi.fn(), delete: vi.fn() } as unknown as R2Bucket & {
    head: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

describe("StorageService", () => {
  it("is disabled without the binding or without R2 settings", () => {
    expect(new StorageService(null, ENV).isEnabled()).toBe(false);
    expect(new StorageService(fakeBucket(), loadEnv({})).isEnabled()).toBe(false);
    expect(new StorageService(fakeBucket(), ENV).isEnabled()).toBe(true);
  });

  it("presignPut returns a random evidence/<uuid> key, a signed R2 URL, and near-future expiry", async () => {
    const svc = new StorageService(fakeBucket(), ENV);
    const before = Date.now();
    const result = await svc.presignPut("image/jpeg", 1000);

    expect(result.objectKey).toMatch(/^evidence\/[0-9a-f-]{36}$/);
    const url = new URL(result.uploadUrl);
    expect(url.origin).toBe("https://acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/bucket/${result.objectKey}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKID\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(result.headers).toEqual({ "Content-Type": "image/jpeg", "Content-Length": "1000" });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime() - before).toBeGreaterThanOrEqual(299_000);
    expect(result.expiresAt.getTime() - before).toBeLessThanOrEqual(301_000);
  });

  it("presignPut signs content-type and content-length", async () => {
    const svc = new StorageService(fakeBucket(), ENV);
    const result = await svc.presignPut("image/jpeg", 1000);
    const signed = new URL(result.uploadUrl).searchParams.get("X-Amz-SignedHeaders")!.split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-type", "content-length", "host"]));
  });

  it("presignGet signs a 60 s GET on the object path", async () => {
    const svc = new StorageService(fakeBucket(), ENV);
    const url = new URL(await svc.presignGet("evidence/abc"));
    expect(url.origin).toBe("https://acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/bucket/evidence/abc");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("head returns null when the object does not exist or the binding throws", async () => {
    const bucket = fakeBucket();
    bucket.head.mockResolvedValueOnce(null);
    const svc = new StorageService(bucket, ENV);
    await expect(svc.head("evidence/missing")).resolves.toBeNull();
    bucket.head.mockRejectedValueOnce(new Error("boom"));
    await expect(svc.head("evidence/missing")).resolves.toBeNull();
    await expect(new StorageService(null, ENV).head("evidence/x")).resolves.toBeNull();
  });

  it("head returns size and content type when the object exists", async () => {
    const bucket = fakeBucket();
    bucket.head.mockResolvedValueOnce({ size: 1234, httpMetadata: { contentType: "image/png" } });
    await expect(new StorageService(bucket, ENV).head("evidence/found")).resolves.toEqual({
      size: 1234,
      contentType: "image/png",
    });
    expect(bucket.head).toHaveBeenCalledWith("evidence/found");
  });

  it("deleteObject deletes through the binding", async () => {
    const bucket = fakeBucket();
    await new StorageService(bucket, ENV).deleteObject("evidence/abc");
    expect(bucket.delete).toHaveBeenCalledWith("evidence/abc");
  });
});
