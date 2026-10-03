import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import { GeminiSeatLocator } from "./gemini-locator.js";
import { ClaudeSeatLocator, type MessagesClient, type SeatLocator } from "./seat-locator.js";
import { createHandler } from "./server.js";

if (env.isProduction && (!env.token || !(env.geminiApiKey || env.anthropicApiKey))) {
  console.error("VERIFIER_TOKEN and GEMINI_API_KEY (or ANTHROPIC_API_KEY) are required in production");
  process.exit(1);
}

const locator: SeatLocator =
  env.provider === "gemini"
    ? new GeminiSeatLocator(env.geminiApiKey, env.model)
    : new ClaudeSeatLocator(new Anthropic({ apiKey: env.anthropicApiKey }) as unknown as MessagesClient, env.model);

const server = createServer(
  createHandler({
    token: env.token,
    locator,
    model: env.model,
    timeoutMs: env.timeoutMs,
  }),
);

server.listen(env.port, () => console.log(JSON.stringify({ evt: "listening", port: env.port, provider: env.provider })));

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
