import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

export interface MercadoPagoSignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}

/**
 * Validates the `x-signature` header of a Mercado Pago webhook. The manifest is
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with absent parts omitted. `ts` (seconds or ms) must be
 * within `MAX_SKEW_MS` of `now`, so a captured header can't be replayed later.
 */
export function verifyMercadoPagoSignature(a: MercadoPagoSignatureInput, now: number = Date.now()): boolean {
  if (!a.xSignature || !a.secret) return false;

  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of a.xSignature.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  if (!ts || !v1) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return false;
  // Values below 1e12 are epoch seconds (ms wouldn't be that small until 2001).
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  if (Math.abs(now - tsMs) > MAX_SKEW_MS) return false;

  let manifest = "";
  if (a.dataId) manifest += `id:${/^[a-zA-Z0-9]+$/.test(a.dataId) ? a.dataId.toLowerCase() : a.dataId};`;
  if (a.xRequestId) manifest += `request-id:${a.xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = Buffer.from(createHmac("sha256", a.secret).update(manifest).digest("hex"));
  const given = Buffer.from(v1);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
