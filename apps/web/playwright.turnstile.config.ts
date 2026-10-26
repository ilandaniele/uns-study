import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// This suite mocks writes. It only reads the room geometry from the local API and must not
// reset that API's SQLite files after the dev server has already opened them (Windows locks).
export default defineConfig({
  ...base,
  globalSetup: undefined,
  testMatch: "26-turnstile-retry.spec.ts",
  projects: (["chromium", "webkit"] as const).flatMap((browserName) =>
    [320, 440, 1440].map((width) => ({
      name: `${browserName}-${width}`,
      use: { browserName, viewport: { width, height: 956 }, isMobile: width < 700, hasTouch: width < 700 },
    })),
  ),
});
