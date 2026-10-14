import { Logger } from "../platform/logger.js";
import { verifyRequestSchema } from "./locator/schema.js";
import type { SeatLocator } from "./locator/seat-locator.js";
import type { SeatPhotoVerifier, SeatPhotoVerifierRequest, SeatPhotoVerifierResult } from "./seat-photo-verifier.js";

/** Input cap kept from the standalone verifier's body limit. */
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
// Under the API's 10 s client timeout so we can still answer "null" instead of being cut off.
const LOCATE_TIMEOUT_MS = 9000;

export interface InProcessVerifierOptions {
  timeoutMs?: number;
}

/**
 * Runs the seat locator (Gemini or Claude) inside the API. Same behaviour as the old standalone
 * verifier: a model error or timeout degrades to "could not tell" (`seatCode: null`), never a throw.
 */
export class InProcessSeatPhotoVerifier implements SeatPhotoVerifier {
  private readonly logger = new Logger(InProcessSeatPhotoVerifier.name);
  private readonly modelVersion: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly locator: SeatLocator,
    model: string,
    options: InProcessVerifierOptions = {},
  ) {
    this.modelVersion = `sala-seat-v1:${model}`;
    this.timeoutMs = options.timeoutMs ?? LOCATE_TIMEOUT_MS;
  }

  async verify(request: SeatPhotoVerifierRequest): Promise<SeatPhotoVerifierResult> {
    if (request.image.base64.length > MAX_INPUT_BYTES) throw new Error("Seat photo too large");
    const parsed = verifyRequestSchema.safeParse(request);
    if (!parsed.success) throw new Error("Invalid seat verification request");
    const body = parsed.data;

    const started = Date.now();
    let seatCode: string | null = null;
    let confidence = 0;
    try {
      const result = await this.locator.locate(body, AbortSignal.timeout(this.timeoutMs));
      if (result.seatCode !== null && body.seats.some((s) => s.code === result.seatCode)) {
        seatCode = result.seatCode;
        confidence = Number.isFinite(result.confidence) ? Math.min(1, Math.max(0, result.confidence)) : 0;
      }
    } catch {
      // Timeout or model error: degrade to "could not tell".
    }
    // Never log the image: only these fields.
    this.logger.log({
      evt: "verify",
      claimed: body.claimedSeatCode,
      predicted: seatCode,
      confidence,
      ms: Date.now() - started,
    });
    return { seatCode, confidence, modelVersion: this.modelVersion };
  }
}
