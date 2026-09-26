import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the first vertical slice (anonymous map -> auth -> presence -> check-in ->
 * realtime -> observations). Assumes the API (port 4000, `PRESENCE_DEV_BYPASS=true`) and the
 * web app (port 3000) are already running locally; `reuseExistingServer` avoids double-starting
 * them when they are (CI would start fresh instead).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @uns/api dev",
      url: "http://localhost:4000/api/v1/rooms",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @uns/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
