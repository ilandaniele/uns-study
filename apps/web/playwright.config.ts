import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the first vertical slice (anonymous map -> auth -> presence -> check-in ->
 * realtime -> observations). Assumes the API (port 4000, `PRESENCE_DEV_BYPASS=true`, `E2E_TEST_HOOKS=true`) and the
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
      command: "pnpm --filter @sala/api dev",
      url: "http://localhost:4000/api/v1/rooms",
      // E2E_TEST_HOOKS mounts the force-expiry endpoint; the API refuses it when NODE_ENV=production.
      env: { E2E_TEST_HOOKS: "true", PRESENCE_DEV_BYPASS: "true" },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @sala/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
