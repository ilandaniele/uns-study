const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
// Gemini wins when both keys are set: its free tier covers the Flash models.
const provider: "gemini" | "anthropic" = geminiApiKey || !anthropicApiKey ? "gemini" : "anthropic";

export const env = {
  port: Number(process.env.PORT) || 8080,
  token: process.env.VERIFIER_TOKEN ?? "",
  provider,
  geminiApiKey,
  anthropicApiKey,
  model: process.env.VERIFIER_MODEL || (provider === "gemini" ? "gemini-2.5-flash" : "claude-sonnet-5-5"),
  // Under the API's 10 s client timeout so we can still answer "null" instead of being cut off.
  timeoutMs: 9000,
  isProduction: process.env.NODE_ENV === "production",
};
