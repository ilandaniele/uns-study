import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Migrates and seeds one PGlite template for the whole run (see src/test-global-setup.ts).
    globalSetup: ["./src/test-global-setup.ts"],
  },
});
