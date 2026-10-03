export const env = {
  port: Number(process.env.PORT) || 8080,
  token: process.env.VERIFIER_TOKEN ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.VERIFIER_MODEL || "claude-sonnet-5-5",
  // Under the API's 10 s client timeout so we can still answer "null" instead of being cut off.
  timeoutMs: 9000,
  isProduction: process.env.NODE_ENV === "production",
};
