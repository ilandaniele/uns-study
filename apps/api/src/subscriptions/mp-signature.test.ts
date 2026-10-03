import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "./mp-signature.js";

const SECRET = "test-secret";

function sign(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

describe("verifyMercadoPagoSignature", () => {
  const ts = "1704908010";
  const requestId = "req-123";
  const dataId = "2c94ABC";
  const xSignature = `ts=${ts},v1=${sign(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)}`;

  it("accepts a valid signature (alphanumeric id is lowercased)", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: SECRET })).toBe(true);
  });

  it("omits an absent data id from the manifest", () => {
    const sig = `ts=${ts},v1=${sign(`request-id:${requestId};ts:${ts};`)}`;
    expect(verifyMercadoPagoSignature({ xSignature: sig, xRequestId: requestId, dataId: undefined, secret: SECRET })).toBe(true);
  });

  it("rejects a tampered data id", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId: "other", secret: SECRET })).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(verifyMercadoPagoSignature({ xSignature: undefined, xRequestId: requestId, dataId, secret: SECRET })).toBe(false);
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: undefined, dataId, secret: SECRET })).toBe(false);
    expect(verifyMercadoPagoSignature({ xSignature: "garbage", xRequestId: requestId, dataId, secret: SECRET })).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: requestId, dataId, secret: "nope" })).toBe(false);
  });
});
