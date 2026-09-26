import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load the repo-root `.env` (if present) before anything else reads `process.env`.
const apiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(apiDir, "..", "..", "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const isProduction = process.env.NODE_ENV === "production";

function ipHashSalt(): string {
  const v = process.env.IP_HASH_SALT ?? "";
  if (!v) {
    if (isProduction) {
      throw new Error("IP_HASH_SALT is required in production.");
    }
    console.warn("[env] IP_HASH_SALT not set — using an insecure dev-only fallback salt.");
    return "dev-salt-change-me";
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  port: num("PORT", 4000),
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgliteDir: process.env.PGLITE_DIR ?? "",
  dbAutoMigrate: bool("DB_AUTO_MIGRATE", process.env.NODE_ENV !== "production"),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  ipHashSalt: ipHashSalt(),
  presenceDevBypass: bool("PRESENCE_DEV_BYPASS", false),
  presenceMaxAgeS: num("PRESENCE_MAX_AGE_S", 120),
  presenceMaxAccuracyM: num("PRESENCE_MAX_ACCURACY_M", 100),
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};
