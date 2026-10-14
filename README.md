# Sala de Estudio

Real-time study-room occupancy map for a university study room in Bahía Blanca. Anonymous room map -> auth -> geofenced presence
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
- `packages/contracts` (`@sala/contracts`) — shared TS types, zod schemas, constants
- `packages/database` (`@sala/database`) — Drizzle ORM schema, migrations, seed, room layout generator
- Neon PostgreSQL (prod) / PGlite (local, no credentials needed)
- Better Auth, Socket.IO, Upstash Redis, Cloudflare R2 (later), Cloudflare Turnstile (later)
- Fly.io (web and api)

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
what you have. With `DATABASE_URL` left empty, `@sala/database` transparently falls back to
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
- **API (Fly.io)**: `fly.toml` (repo root) + `Dockerfile.api` (multi-stage, `node:22-slim`, non-root
  `node` user). Fly builds the image remotely (`fly deploy`), no local Docker needed. The container
  `CMD` runs `pnpm db:migrate && pnpm db:seed && node apps/api/dist/main.js` on every boot — cheap
  and idempotent (see "Scale-to-zero and background jobs" below), and simpler than a separate
  release step. `fly.toml` pre-fills the non-secret env (`WEB_ORIGIN`, `BETTER_AUTH_URL`,
  `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `DB_AUTO_MIGRATE=false`,
  `TRUST_PROXY_HOPS=2`, `PRESENCE_DEV_BYPASS=false`) and an `[http_service.checks]` hitting
  `/api/v1/health`. Secrets are set once via `fly secrets set`:
  ```bash
  fly secrets set \
    DATABASE_URL="postgres://sala_app:...@sala-de-estudio-db.flycast:5432/..." \
    GOOGLE_CLIENT_SECRET="..."
  ```
  `DATABASE_URL` is the least-privilege `sala_app` connection string for the Fly Postgres app
  `sala-de-estudio-db` (see `10_ENVIRONMENT_AND_SERVICES.md`). `packages/database/src/client.ts`
  enables SSL exactly when the URL contains `sslmode=`. `BETTER_AUTH_SECRET` and `IP_HASH_SALT` are **not** Fly secrets: on first boot
  the API generates and persists them in the `app_secrets` table (see `apps/api/src/secrets.ts`), so
  there's nothing to hand-type for those two. Setting either as an env var still overrides the stored
  value, if you ever need that. Rotating a stored secret = delete its `app_secrets` row + restart the
  machine (rotating `BETTER_AUTH_SECRET` logs everyone out). `min_machines_running = 0` and
  `auto_stop_machines = "stop"` mean the single
  machine scales to zero when idle and cold-starts on the next request (free-tier friendly, like the
  old Render setup); `RateLimitService` no longer requires Upstash/`REDIS_URL` in production — with
  neither set it now falls back to a Postgres-backed limiter (`rate_limit_hits` table) instead of
  refusing to boot, since `DATABASE_URL` is already mandatory.
  - **Scale-to-zero and background jobs**: `ExpirationJob` and `DailyResetJob` run in-process on a
    schedule (`@nestjs/schedule`), so they only tick while a machine is actually up. On Render (never
    scaled to zero) this was continuous; on Fly with `min_machines_running = 0` a machine that's been
    idle stops both jobs until the next request wakes it. This is safe because map reads already
    treat `expires_at <= now()` as expired lazily (never trust a stale `seat_current_state` row), and
    `DailyResetJob` is idempotent (`last_reset_at` gates it) — so a machine that wakes up hours after
    the 04:00 reset boundary just runs the reset once on its next tick instead of on time. No data
    correctness issue, just latency on both jobs proportional to how long the machine was asleep.
- **Web (Fly.io app `sala-de-estudio`)**: `Dockerfile.web` + `fly.web.toml`, deploy with `fly deploy -c fly.web.toml --remote-only`; `API_PROXY_TARGET=https://uns-study-api.fly.dev` is a build arg in `fly.web.toml`
  (server-only, no `NEXT_PUBLIC_` prefix), `NEXT_PUBLIC_API_URL=` (empty),
  `NEXT_PUBLIC_SOCKET_URL=https://uns-study-api.fly.dev`, optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **Same-origin proxy**: web and API live on different domains, but Safari/iOS block third-party
  `SameSite=None` cookies, so `apps/web/next.config.ts` rewrites `/api/auth/*` and `/api/v1/*` to
  `API_PROXY_TARGET` (the Fly.io URL) whenever that env is set — making the Better Auth session
  cookie first-party from the browser's point of view. The API's `BETTER_AUTH_URL` is then the
  **web** origin (`https://sala-de-estudio.fly.dev`), cookies are `SameSite=Lax; Secure`
  (`CROSS_SITE_COOKIES=true` restores the old cross-site `SameSite=None` behaviour if you deploy
  without the proxy), and `TRUST_PROXY_HOPS=2` (the web app's rewrite proxy, then Fly's own edge proxy).
  Google OAuth redirect URI becomes `<BETTER_AUTH_URL>/api/auth/callback/google`, i.e.
  `https://sala-de-estudio.fly.dev/api/auth/callback/google`.
- **Socket.IO** can't be routed through the web app's rewrites, so the browser always connects to it
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
pnpm --filter @sala/web exec playwright install chromium   # once, to fetch the browser
pnpm --filter @sala/web test:e2e
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
