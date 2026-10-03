import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { checkBearer } from "./auth.js";
import { verifyRequestSchema, type VerifyResponse } from "./schema.js";
import type { SeatLocator } from "./seat-locator.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface HandlerDeps {
  token: string;
  locator: SeatLocator;
  model: string;
  timeoutMs: number;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

class BodyTooLargeError extends Error {}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  // Keep draining an oversize upload (without buffering it) so the client reads the 413 instead of a reset.
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) tooLarge = true;
    else chunks.push(chunk as Buffer);
  }
  if (tooLarge) throw new BodyTooLargeError();
  return Buffer.concat(chunks).toString("utf8");
}

export function createHandler(deps: HandlerDeps): RequestListener {
  const modelVersion = `sala-seat-v1:${deps.model}`;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || path !== "/") return send(res, 404, { error: "not_found" });

    if (!checkBearer(req.headers.authorization, deps.token)) return send(res, 401, { error: "unauthorized" });

    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return send(res, 413, { error: "payload_too_large" });
      }
      return send(res, 400, { error: "bad_request" });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "bad_request" });
    }
    const parsed = verifyRequestSchema.safeParse(json);
    if (!parsed.success) return send(res, 400, { error: "bad_request" });
    const body = parsed.data;

    const started = Date.now();
    let seatCode: string | null = null;
    let confidence = 0;
    try {
      const result = await deps.locator.locate(body, AbortSignal.timeout(deps.timeoutMs));
      if (result.seatCode !== null && body.seats.some((s) => s.code === result.seatCode)) {
        seatCode = result.seatCode;
        confidence = Number.isFinite(result.confidence) ? Math.min(1, Math.max(0, result.confidence)) : 0;
      }
    } catch {
      // Timeout or model error: degrade to "could not tell".
    }
    // Never log the image: only these fields.
    console.log(
      JSON.stringify({ evt: "verify", claimed: body.claimedSeatCode, predicted: seatCode, confidence, ms: Date.now() - started }),
    );
    const out: VerifyResponse = { seatCode, confidence, modelVersion };
    send(res, 200, out);
  };

  return (req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: "internal" });
      else res.end();
    });
  };
}
