import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn(async () => "https://signed.example/upload");

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function () {
    return { send: sendMock };
  }),
  PutObjectCommand: vi.fn(function (input: unknown) {
    return { input };
  }),
  GetObjectCommand: vi.fn(function (input: unknown) {
    return { input };
  }),
  HeadObjectCommand: vi.fn(function (input: unknown) {
    return { input };
  }),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

describe("StorageService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    getSignedUrlMock.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function buildEnabled() {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_REPORT_EVIDENCE = "bucket";
    process.env.R2_ENDPOINT = "https://r2.example.com";
    const { StorageService } = await import("./storage.service.js");
    return new StorageService();
  }

  it("is disabled when R2 env vars are missing", async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_REPORT_EVIDENCE;
    delete process.env.R2_ENDPOINT;
    vi.resetModules();
    const { StorageService } = await import("./storage.service.js");
    const svc = new StorageService();
    expect(svc.isEnabled()).toBe(false);
  });

  it("is enabled when all R2 env vars are set", async () => {
    const svc = await buildEnabled();
    expect(svc.isEnabled()).toBe(true);
  });

  it("presignPut returns a random evidence/<uuid> key with a PUT method and near-future expiry", async () => {
    const svc = await buildEnabled();
    const result = await svc.presignPut("image/jpeg", 1000);
    expect(result.objectKey).toMatch(/^evidence\/[0-9a-f-]{36}$/);
    expect(result.uploadUrl).toBe("https://signed.example/upload");
    expect(result.headers["Content-Type"]).toBe("image/jpeg");
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("head returns null when the object does not exist", async () => {
    sendMock.mockRejectedValueOnce(new Error("NotFound"));
    const svc = await buildEnabled();
    await expect(svc.head("evidence/missing")).resolves.toBeNull();
  });

  it("head returns content type/length when the object exists", async () => {
    sendMock.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: 1234 });
    const svc = await buildEnabled();
    await expect(svc.head("evidence/found")).resolves.toEqual({ contentType: "image/png", contentLength: 1234 });
  });
});
