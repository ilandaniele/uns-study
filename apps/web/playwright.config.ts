import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the first vertical slice (anonymous map -> auth -> presence -> check-in ->
 * realtime -> observations). Starts the API Worker under `wrangler dev` (port 4000, state in `.wrangler/e2e`, wiped by
 * global setup) and the web app under `next dev` (port 3000, same-origin rewrites to the API);
 * `reuseExistingServer` skips either when it is already running.
 */
export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // Marks the "Cómo usar la app" guide as seen and snoozes house ads, so neither overlay covers the map.
    storageState: "e2e/storage-state.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @sala/api exec wrangler dev --port 4000 --persist-to .wrangler/e2e --var E2E_TEST_HOOKS:1 --var PRESENCE_DEV_BYPASS:1 --var NODE_ENV:development",
      url: "http://localhost:4000/api/v1/rooms",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @sala/web dev",
      url: "http://localhost:3000",
      env: {
        API_PROXY_TARGET: "http://localhost:4000",
        NEXT_PUBLIC_SOCKET_URL: "ws://localhost:4000",
        // Cloudflare's public test site key; never used in deployment builds.
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
