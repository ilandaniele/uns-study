import Anthropic from "@anthropic-ai/sdk";
import { env, type Env } from "../env.js";
import { Logger } from "../platform/logger.js";
import { InProcessSeatPhotoVerifier } from "./in-process-seat-photo-verifier.js";
import { GeminiSeatLocator } from "./locator/gemini-locator.js";
import { ClaudeSeatLocator, type MessagesClient, type SeatLocator } from "./locator/seat-locator.js";
import { MockSeatPhotoVerifier } from "./mock-seat-photo-verifier.js";
import type { SeatPhotoVerifier } from "./seat-photo-verifier.js";

const logger = new Logger("verification");

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

/**
 * Picks the configured `SeatPhotoVerifier`, or `null` when the feature is off. `null` disables the
 * whole feature: `GET /verification/status` reports it, and `POST /checkins/:id/photo` answers
 * `VERIFIER_UNAVAILABLE`.
 *
 * Order: mock (development, no model key) -> in-process model (Gemini wins over Claude: its free
 * tier covers the Flash models) -> `null`.
 */
export function createSeatPhotoVerifier(e: Env = env): SeatPhotoVerifier | null {
  const hasModelKey = Boolean(e.geminiApiKey || e.anthropicApiKey);
  if (e.seatVerifierMode === "mock" && !e.isProduction && !hasModelKey) {
    logger.warn(
      "SEAT_VERIFIER_MODE=mock - every submitted photo will be accepted as the claimed seat. Dev/test only.",
    );
    return new MockSeatPhotoVerifier();
  }
  if (hasModelKey) {
    let locator: SeatLocator;
    let model: string;
    if (e.geminiApiKey) {
      model = e.verifierModel || DEFAULT_GEMINI_MODEL;
      locator = new GeminiSeatLocator(e.geminiApiKey, model);
    } else {
      model = e.verifierModel || DEFAULT_CLAUDE_MODEL;
      locator = new ClaudeSeatLocator(new Anthropic({ apiKey: e.anthropicApiKey }) as unknown as MessagesClient, model);
    }
    return new InProcessSeatPhotoVerifier(locator, model, { provider: e.geminiApiKey ? "gemini" : "anthropic" });
  }
  return null;
}
