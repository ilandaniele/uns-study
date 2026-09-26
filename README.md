# UNS Study

Real-time study-room occupancy map for UNS. Anonymous room map -> auth -> geofenced presence
-> self check-in -> realtime state -> observations -> expiration -> daily reset.

## Stack

- Turborepo + pnpm workspaces
- `apps/web` — Next.js (App Router, TypeScript, Tailwind)
- `apps/api` — NestJS (TypeScript, Express platform)
- `packages/contracts` (`@uns/contracts`) — shared TS types, zod schemas, constants
- `packages/database` (`@uns/database`) — Drizzle ORM schema, migrations, seed, room layout generator
- Neon PostgreSQL (prod) / PGlite (local, no credentials needed)
- Better Auth, Socket.IO, Upstash Redis, Cloudflare R2 (later), Cloudflare Turnstile (later)
- Vercel (web), Railway (api)

## Commands

```bash
pnpm install

pnpm dev          # run apps in dev mode (turbo, persistent)
pnpm build        # build all packages/apps
pnpm lint         # eslint across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm test         # vitest across the workspace

pnpm db:generate  # drizzle-kit generate — writes packages/database/migrations
pnpm db:migrate   # apply migrations (Postgres or local PGlite, see below)
pnpm db:seed      # idempotent seed of the initial room (slug `principal`, 108 seats)
```

## Local database

Copy `.env.example` to `.env` (and/or `apps/api/.env`, `apps/web/.env.local`) and fill in only
what you have. With `DATABASE_URL` left empty, `@uns/database` transparently falls back to
[PGlite](https://pglite.dev/) persisted at `.data/pglite` in the repo root (override with
`PGLITE_DIR`, or use `memory://` for ephemeral/test runs) — so `pnpm db:migrate && pnpm db:seed`
works with zero external services. Set `DATABASE_URL` to a real Postgres/Neon connection string to
switch to `drizzle-orm/node-postgres`.

PGlite is single-process. The API takes a lock file (`.data/pglite.lock`) and any second process
(e.g. `pnpm db:seed` while the API runs) refuses to open the same directory instead of corrupting
it. Stop the API before seeding. If the local store ever gets corrupted, delete `.data/pglite` and
run `pnpm db:migrate && pnpm db:seed` again (local dev data only).

For local testing away from the room, set `PRESENCE_DEV_BYPASS=true` (refused when
`NODE_ENV=production`).

## Deploy

- **API (Railway)**: build `pnpm install && pnpm --filter @uns/api build`, start
  `pnpm --filter @uns/api start`. Workspace packages are bundled into `apps/api/dist` by tsup.
  Pre-deploy: `pnpm db:migrate && pnpm db:seed` with `DATABASE_URL` set (keep
  `DB_AUTO_MIGRATE=false` in production). Required in production: `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, `IP_HASH_SALT`,
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Optional: Google OAuth, Turnstile.
- **Web (Vercel)**: root `apps/web`, env `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`,
  optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Web and API live on different domains, so auth cookies are `SameSite=None; Secure` in
  production. Google OAuth redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`.

## E2E

`apps/web/e2e` has a Playwright suite covering the first vertical slice (anonymous map, check-in,
realtime propagation, observations, geolocation errors). It expects the API (port 4000, with
`PRESENCE_DEV_BYPASS=true`) and the web app (port 3000) to already be running — `pnpm dev` in one
terminal, then in another:

```bash
pnpm --filter @uns/web exec playwright install chromium   # once, to fetch the browser
pnpm --filter @uns/web test:e2e
```

Each test creates its own throwaway user via the auth API and checks out at the end, so it's safe
to re-run against a live dev server.

## Specs

- [`00_START_HERE.md`](./00_START_HERE.md)
- [`01_PRD.md`](./01_PRD.md)
- [`02_ARCHITECTURE.md`](./02_ARCHITECTURE.md)
- [`03_DOMAIN_AND_DATABASE.md`](./03_DOMAIN_AND_DATABASE.md)
- [`04_API_AND_REALTIME.md`](./04_API_AND_REALTIME.md)
- [`05_ROOM_LAYOUT.md`](./05_ROOM_LAYOUT.md)
- [`06_UI_UX_SPEC.md`](./06_UI_UX_SPEC.md)
- [`07_SECURITY_MODERATION_PRIVACY.md`](./07_SECURITY_MODERATION_PRIVACY.md)
- [`08_IMPLEMENTATION_PLAN.md`](./08_IMPLEMENTATION_PLAN.md)
- [`09_ACCEPTANCE_CRITERIA.md`](./09_ACCEPTANCE_CRITERIA.md)
- [`10_ENVIRONMENT_AND_SERVICES.md`](./10_ENVIRONMENT_AND_SERVICES.md)
- [`handoff.md`](./handoff.md) — shared contract for all agents working on this repo
