import { z } from "zod";
import { describeLayout } from "./layout-description.js";
import type { VerifyRequest } from "./schema.js";
import { PLAN_MIME } from "./plan-image.js";
import { SYSTEM_PROMPT, loadPlan, type LocateResult, type SeatLocator } from "./seat-locator.js";
import { VerifierProviderError } from "../verifier-error.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    seatCode: { type: "STRING", nullable: true, description: "A seat code from the provided list, or null if unsure." },
    confidence: { type: "NUMBER", description: "Between 0 and 1." },
  },
  required: ["seatCode", "confidence"],
};

const answerSchema = z.object({
  seatCode: z.string().nullable(),
  confidence: z.number(),
});

const responseSchema = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }) }))
    .min(1),
});

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Gemini (Google AI Studio) backend: free tier covers the Flash models. */
export class GeminiSeatLocator implements SeatLocator {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly plan: () => string = loadPlan,
    // Workers' native fetch requires the global receiver; storing it directly as a method fails.
    private readonly fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init),
  ) {}

  async locate(req: VerifyRequest, signal: AbortSignal): Promise<LocateResult> {
    const flash38 = /^gemini-3\.8-flash(?:-|$)/.test(this.model);
    const flash35Lite = /^gemini-3\.5-flash-lite(?:-|$)/.test(this.model);
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT.replace("calling the report_seat tool", "returning JSON") }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: "Floor plan of the room (windows at the top, entrance at the bottom):" },
            { inlineData: { mimeType: PLAN_MIME, data: this.plan() } },
            { text: "Photo taken from the seat:" },
            { inlineData: { mimeType: req.image.mimeType, data: req.image.base64 } },
            { text: `${describeLayout(req.seats)}\n\nPredict the seat from the photo alone; null if ambiguous.` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: flash38 ? 4096 : 1024,
        // Flash 3.8 supports LOW, not MINIMAL or a disabled thinking budget.
        ...(flash38 ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}),
        ...(flash35Lite ? { thinkingConfig: { thinkingLevel: "MINIMAL" } } : {}),
        // Flash 2.5 otherwise spends its tiny JSON budget thinking and may return no answer.
        ...(/^gemini-2\.5-flash(?:-|$)/.test(this.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    };
    // Key goes in a header, never the URL, so it cannot leak into proxy or access logs.
    const res = await this.fetchImpl(`${API_BASE}/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new VerifierProviderError(res.status === 401 || res.status === 403 ? "CREDENTIALS" : res.status === 429 ? "QUOTA" : res.status === 404 ? "MODEL" : "PROVIDER", `gemini http ${res.status}`);
    const parsed = responseSchema.parse(await res.json());
    const text = parsed.candidates[0].content.parts.filter(part => !part.thought).map((p) => p.text ?? "").join("");
    return answerSchema.parse(JSON.parse(text));
  }
}
