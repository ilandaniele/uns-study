# Sala de Estudio UNS

Real-time study-room occupancy map for UNS. Anonymous room map -> auth -> geofenced presence
-> self check-in -> realtime state -> observations -> expiration -> daily reset, plus profiles,
social features, moderation and admin tooling built on top of that vertical slice.

## Features

- **Room map** — anonymous read-only SVG map, self check-in (60 min), `Está libre` / `Está ocupado`
  observations, realtime propagation via Socket.IO, expiration + daily reset jobs.
- **Profiles & privacy** — `/perfil` (identity mode, per-field privacy toggles, Modo Estudio,
  account deletion), `/personas` (room people list), public `/u/[userId]` profiles.
- **Chat & DMs** — global room chat (`/chat`), direct messages (`/chat/dm`), blocking, per-message
  report/delete.
- **Reports & moderation** — `/reportar/[userId]` (optional photo evidence via Cloudflare R2, or a
  no-photo fallback when storage isn't configured), `/admin` (reports queue, user search +
  restrictions, audit log, announcements CRUD, QR codes, room stats). Admins/moderators are
  granted via the `ADMIN_EMAILS` env (comma-separated, case-insensitive) on their first `/me`
  request after signing in — no DB seed step needed.
- **Rankings & QR** — `/ranking` (study time / streak / contribution, per period), printable QR
  codes per table (`/q/[token]` deep-links into the room, highlighting the scanned table).
- **Announcements & community** — room-page announcement banner, `/comunidad` public feed.
- **PWA & analytics** — installable manifest + icons, offline shell, optional AdSense slots
  (`room-bottom`, `community-feed`) and GA4 events, all inert unless their env vars are set.

Data retention policy: see [`docs/DATA_RETENTION.md`](./docs/DATA_RETENTION.md).

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

### Optional envs

- `ADMIN_EMAILS` (API) — comma-separated, case-insensitive list of emails granted the `ADMIN` role
  on their first `GET /me` after signing in. Leave empty in dev if you don't need `/admin`.
- `R2_*` (API) — Cloudflare R2 credentials for report-evidence uploads. Left empty, report
  submission still works but skips the photo (`STORAGE_UNAVAILABLE`, surfaced to the user as a
  friendly "sent without photo" message).
- `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM` /
  `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED` (web) — AdSense publisher + per-placement slot ids.
  `<AdSlot>` renders nothing unless both the client id and that placement's slot id are set.
- `NEXT_PUBLIC_GA_ID` (web) — GA4 measurement id; the loader and `trackEvent` calls are no-ops
  without it.

## Deploy

- **CI**: `.github/workflows/ci.yml` runs lint, typecheck, tests and both builds on push/PR.
- **API (Render)**: Blueprint at `render.yaml` (repo root) defines the `uns-study-api` web
  service — chosen over Railway because Railway isn't available on this account; `apps/api/railway.json`
  is kept for reference/portability but isn't the deploy path in use. Render's free plan has no
  pre-deploy step, so migrate+seed run as part of `startCommand`:
  `pnpm db:migrate && pnpm db:seed && pnpm --filter @uns/api start` (build:
  `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm --filter @uns/api build`
  — `--prod=false` so `tsx`, used by the migrate/seed scripts, is installed). Workspace packages are
  bundled into `apps/api/dist` by tsup. The Blueprint is **zero-secret**: it also provisions a Render
  managed Postgres database (`uns-study-db`) and a Render Key Value instance (`uns-study-kv`), and
  wires `DATABASE_URL`/`REDIS_URL` to them via `fromDatabase`/`fromService`, so nothing needs to be
  typed into the Render dashboard to get a working deploy. `BETTER_AUTH_SECRET` and `IP_HASH_SALT`
  are auto-generated by the Blueprint; `WEB_ORIGIN`/`BETTER_AUTH_URL`/`ADMIN_EMAILS`/
  `DB_AUTO_MIGRATE`/`ROOM_RESET_TIMEZONE`/`TRUST_PROXY_HOPS`/`PRESENCE_DEV_BYPASS` are pre-filled.
  Optional: Google OAuth, Turnstile.
  - **Postgres**: Render's free Postgres plan **expires 30 days after creation** (Render deletes
    it). Before that happens, migrate to the already-created Neon project `uns-study` — create a
    Neon database, copy its connection string, and set `DATABASE_URL` on the `uns-study-api`
    service in the Render dashboard (this overrides the Blueprint's `fromDatabase` value; re-syncing
    the Blueprint later won't clobber a dashboard override for a `sync: false`-style key). Neon
    requires `sslmode=require` in the URL; `packages/database/src/client.ts` enables SSL exactly
    when the connection string contains `sslmode=`, so no code change is needed either way.
  - **Key Value / Redis**: `REDIS_URL` from `uns-study-kv` is used automatically
    (`RateLimitService` connects via `ioredis`). Upstash Redis (REST) remains supported and takes
    priority if `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set — useful if you'd rather
    not depend on Render's Key Value offering — but it's optional; the Blueprint no longer requires
    it.
- **Web (Vercel)**: root `apps/web`, env `API_PROXY_TARGET=https://<render-host>` (server-only, no
  `NEXT_PUBLIC_` prefix), `NEXT_PUBLIC_API_URL=` (empty), `NEXT_PUBLIC_SOCKET_URL=https://<render-host>`,
  optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **Same-origin proxy**: web and API live on different domains, but Safari/iOS block third-party
  `SameSite=None` cookies, so `apps/web/next.config.ts` rewrites `/api/auth/*` and `/api/v1/*` to
  `API_PROXY_TARGET` (the Render URL) whenever that env is set — making the Better Auth session
  cookie first-party from the browser's point of view. The API's `BETTER_AUTH_URL` is then the
  **web** origin (`https://uns-study.vercel.app`), cookies are `SameSite=Lax; Secure`
  (`CROSS_SITE_COOKIES=true` restores the old cross-site `SameSite=None` behaviour if you deploy
  without the proxy), and `TRUST_PROXY_HOPS=2` (Vercel's rewrite proxy, then Render's own proxy).
  Google OAuth redirect URI becomes `<BETTER_AUTH_URL>/api/auth/callback/google`, i.e.
  `https://uns-study.vercel.app/api/auth/callback/google`.
- **Socket.IO** can't be routed through Vercel's rewrites, so the browser always connects to it
  directly via `NEXT_PUBLIC_SOCKET_URL`. Since that bypasses the same-origin proxy (and its
  cookie), authenticated sockets instead fetch a short-lived signed token from
  `GET /api/v1/realtime/token` (same-origin REST call) and pass it as `handshake.auth.token`; the
  gateway falls back to the session cookie only when no token is presented (local dev, where the
  socket and API already share an origin).

## E2E

`apps/web/e2e` has a Playwright suite covering the first vertical slice (anonymous map, check-in,
realtime propagation, observations, geolocation errors) plus the social features built on top of
it (profile privacy, chat realtime + blocking, DMs, reporting without a photo, the PWA manifest).
It expects the API (port 4000, with `PRESENCE_DEV_BYPASS=true`) and the web app (port 3000) to
already be running — `pnpm dev` in one terminal, then in another:

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
