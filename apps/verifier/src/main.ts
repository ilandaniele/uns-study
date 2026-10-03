import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import { ClaudeSeatLocator, type MessagesClient } from "./seat-locator.js";
import { createHandler } from "./server.js";

if (env.isProduction && (!env.token || !env.anthropicApiKey)) {
  console.error("VERIFIER_TOKEN and ANTHROPIC_API_KEY are required in production");
  process.exit(1);
}

const client = new Anthropic({ apiKey: env.anthropicApiKey || "unset" });
const server = createServer(
  createHandler({
    token: env.token,
    locator: new ClaudeSeatLocator(client as unknown as MessagesClient, env.model),
    model: env.model,
    timeoutMs: env.timeoutMs,
  }),
);

server.listen(env.port, () => console.log(JSON.stringify({ evt: "listening", port: env.port })));

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
