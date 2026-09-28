import { z } from "zod";
import type { SeatPhotoVerifier, SeatPhotoVerifierRequest, SeatPhotoVerifierResult } from "./seat-photo-verifier.js";

const VERIFY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

const responseSchema = z.object({
  seatCode: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
});

/** Calls the external seat verifier model over HTTP — see docs/SEAT_PHOTO_VERIFIER.md. */
export class HttpSeatPhotoVerifier implements SeatPhotoVerifier {
  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {}

  async verify(request: SeatPhotoVerifierRequest): Promise<SeatPhotoVerifierResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      // Never follow a redirect to an attacker-controlled host with the photo bytes in the body.
      redirect: "error",
    });
    if (!res.ok) throw new Error(`Seat verifier responded ${res.status}`);
    return responseSchema.parse(JSON.parse(await readCappedText(res)));
  }
}

/** Reads a response body as text, aborting once it's read (or claims to be, via `Content-Length`)
 *  more than `MAX_RESPONSE_BYTES` — the verifier's response is small JSON; anything bigger is
 *  either misbehaving or hostile, and shouldn't be buffered into memory or parsed. */
async function readCappedText(res: Response): Promise<string> {
  const contentLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Seat verifier response too large (Content-Length ${contentLength})`);
  }
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("Seat verifier response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}
