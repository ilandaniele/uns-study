import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  // Self-contained bundle: the runtime image ships only dist/ and assets/, no node_modules.
  noExternal: [/.*/],
});
