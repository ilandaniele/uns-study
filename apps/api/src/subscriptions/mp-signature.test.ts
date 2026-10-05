import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "./mp-signature.js";

const SECRET = "test-secret";

function sign(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

describe("verifyMercadoPagoSignature", () => {
  const now = 1_704_908_010_000;
  const ts = String(now / 1000);
  const requestId = "req-123";
  const dataId = "2c94ABC";
  const xSignature = `ts=${ts},v1=${sign(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)}`;

  it("accepts a valid signature (alphanumeric id is lowercased)", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: SECRET }, now)).toBe(true);
  });

  it("omits an absent data id from the manifest", () => {
    const sig = `ts=${ts},v1=${sign(`request-id:${requestId};ts:${ts};`)}`;
    expect(verifyMercadoPagoSignature({ xSignature: sig, xRequestId: requestId, dataId: undefined, secret: SECRET }, now)).toBe(true);
  });

  it("rejects a tampered data id", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId: "other", secret: SECRET }, now)).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(verifyMercadoPagoSignature({ xSignature: undefined, xRequestId: requestId, dataId, secret: SECRET }, now)).toBe(false);
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: undefined, dataId, secret: SECRET }, now)).toBe(false);
    expect(verifyMercadoPagoSignature({ xSignature: "garbage", xRequestId: requestId, dataId, secret: SECRET }, now)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: "nope" }, now)).toBe(false);
  });

  it("accepts ts in milliseconds", () => {
    const tsMs = String(now);
    const sig = `ts=${tsMs},v1=${sign(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${tsMs};`)}`;
    expect(verifyMercadoPagoSignature({ xSignature: sig, xRequestId: requestId, dataId, secret: SECRET }, now)).toBe(true);
  });

  it("rejects a validly signed but stale timestamp (seconds and ms)", () => {
    const later = now + 5 * 60 * 1000 + 1000;
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: SECRET }, later)).toBe(false);
    const tsMs = String(now);
    const sig = `ts=${tsMs},v1=${sign(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${tsMs};`)}`;
    expect(verifyMercadoPagoSignature({ xSignature: sig, xRequestId: requestId, dataId, secret: SECRET }, later)).toBe(false);
  });

  it("accepts a timestamp just inside the window and rejects one from the future", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: SECRET }, now + 4 * 60 * 1000)).toBe(true);
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: SECRET }, now - 6 * 60 * 1000)).toBe(false);
  });
});
