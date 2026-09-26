import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  // Workspace packages export TS sources, so they must be bundled rather than resolved at runtime.
  noExternal: [/^@uns\//],
});
