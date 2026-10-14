import { rmSync } from "node:fs";
import path from "node:path";

// Fresh Durable Object state for every run: the API Worker persists to .wrangler/e2e under apps/api.
export default function globalSetup() {
  rmSync(path.resolve(import.meta.dirname, "../../api/.wrangler/e2e"), { recursive: true, force: true });
}
