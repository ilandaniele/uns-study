# Sala de Estudio

Real-time study-room occupancy map for a university study room in Bahía Blanca. Anonymous room map -> auth -> geofenced presence
-> self check-in -> realtime state -> observations -> expiration -> daily reset, plus profiles,
social features, moderation and admin tooling built on top of that vertical slice.

## Features

- **Room map** — anonymous read-only SVG map, self check-in (60 min), `Está libre` / `Está ocupado`
  observations, realtime propagation over WebSockets, expiration + daily reset jobs.
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

## Rights and third-party materials

Original protectable contributions by Ilan Daniele are reserved under [LICENSE](./LICENSE); this is not an open-source license for the project as a whole. Public visibility does not grant a general exploitation license. Third-party components retain their own terms: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). AI-assisted material is identified without asserting automatic exclusive copyright over all generated output. [Registration preparation](./docs/legal/README.md) is a review dossier, not proof of a DNDA or INPI filing or grant.

## Stack

- Turborepo + pnpm workspaces
- `apps/web` — Next.js (App Router, TypeScript, Tailwind)
- `apps/api` — Hono on a Cloudflare Worker (TypeScript), with a singleton Durable Object that owns the database and the sockets
- `packages/contracts` (`@sala/contracts`) — shared TS types, zod schemas, constants
- `packages/database` (`@sala/database`) — Drizzle ORM schema, migrations, seed, room layout generator
- Durable Object SQLite (prod and local `wrangler dev`, no credentials needed) via Drizzle ORM
- Better Auth, WebSocket Hibernation (Durable Objects), Cloudflare R2, Cloudflare Turnstile
- Cloudflare Workers: `uns-web` (Next.js via OpenNext) and `uns-api` (Hono + Durable Object), same origin `saladeestudio.com.ar`

## Commands

```bash
pnpm install

pnpm dev          # run apps in dev mode (turbo, persistent)
pnpm build        # build all packages/apps
pnpm lint         # eslint across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm test         # vitest across the workspace

pnpm db:generate  # drizzle-kit generate — writes packages/database/migrations
```

## Local database

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` (git-ignored) and fill in only what you have. `pnpm dev`
runs the API with `wrangler dev` on port 4000, backed by a local Durable Object SQLite persisted under
`apps/api/.wrangler/state` — no external services or connection strings. `AppDO` applies the Drizzle migrations
and seeds the initial room (slug `principal`, 108 seats) on its first request, idempotently. To start from a clean
store, stop the API and delete `apps/api/.wrangler/state`.

For local testing away from the room, set `PRESENCE_DEV_BYPASS=true` (refused when
`NODE_ENV=production`).

### Optional envs

- `ADMIN_EMAILS` (API) — comma-separated, case-insensitive list of emails granted the `ADMIN` role
  on their first `GET /me` after signing in. Leave empty in dev if you don't need `/admin`.
- `R2_*` (API) — Cloudflare R2 credentials for report-evidence uploads. Left empty, report
  submission still works but skips the photo (`STORAGE_UNAVAILABLE`, surfaced to the user as a
  friendly "sent without photo" message).
- `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` /
  `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED` (web) — AdSense publisher + per-placement slot ids.
  `<AdSlot>` renders nothing unless both the client id and that placement's slot id are set.
- `NEXT_PUBLIC_GA_ID` (web) — GA4 measurement id; the loader and `trackEvent` calls are no-ops
  without it.

## Deploy

- **CI**: `.github/workflows/ci.yml` runs lint, typecheck, tests and both builds on push/PR.
- **CD**: `.github/workflows/deploy.yml` runs on push to main, after CI: it deploys the API Worker
  (`wrangler deploy` from `apps/api`), then the web Worker (OpenNext build + `wrangler deploy` from `apps/web`),
  then a smoke check. Auth uses a scoped `CLOUDFLARE_API_TOKEN` in GitHub Actions secrets.
- **API (`uns-api`)**: `apps/api/wrangler.jsonc`. The Worker forwards every request to the singleton Durable Object
  `AppDO`, which runs the Hono app, owns the SQLite database and holds the WebSockets. Non-secret config is in the
  `vars` block (`WEB_ORIGINS`, `BETTER_AUTH_URL`, `OWNER_EMAIL`, `GOOGLE_CLIENT_ID`, `PRESENCE_DEV_BYPASS=false`, ...).
  Secrets are set once with `wrangler secret put` from `apps/api`:
  ```bash
  pnpm exec wrangler secret put BETTER_AUTH_SECRET
  pnpm exec wrangler secret put IP_HASH_SALT
  pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
  ```
  The full list of names is in `apps/api/.dev.vars.example`. Rotating `BETTER_AUTH_SECRET` logs everyone out.
  The `EVIDENCE` R2 binding holds report evidence. Plan: Workers Paid (USD 5/month).
- **Web (`uns-web`)**: `apps/web/wrangler.jsonc`, built with `@opennextjs/cloudflare` (`apps/web/open-next.config.ts`).
  Optional build-time vars: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the AdSense and GA4 ids.
- **Same-origin routing**: the zone routes `saladeestudio.com.ar/api/*` to `uns-api` and everything else to `uns-web`,
  so the Better Auth session cookie is first-party (`SameSite=Lax; Secure`) and Safari/iOS keep it.
  `BETTER_AUTH_URL` is the web origin, and the Google OAuth redirect URI is
  `https://saladeestudio.com.ar/api/auth/callback/google`. The Next rewrites to the API
  (`API_PROXY_TARGET`) are only for local dev, where web (3000) and API (4000) have different origins;
  `CROSS_SITE_COOKIES=true` restores `SameSite=None` if you ever deploy them on different domains.
- **Realtime**: a raw WebSocket at `GET /api/v1/realtime/ws`, served by `AppDO` with the Hibernation API (idle
  sockets do not keep the object running; `ping` is answered with `pong` without waking it). Authenticated sockets
  fetch a short-lived signed token from `GET /api/v1/realtime/token` and pass it as `?token=`; the gateway falls back
  to the session cookie when no token is presented. Event names are in `SocketEvents` (`@sala/contracts`).
- **Background jobs**: `ExpirationJob`, `DailyResetJob` and the other jobs are rows in a persisted `scheduled_jobs`
  table multiplexed onto the single Durable Object alarm. A Cron Trigger (`* * * * *`) pings the object as a safety
  net and re-arms a lost alarm. Map reads also treat `expires_at <= now()` as expired lazily, and `DailyResetJob` is
  idempotent (`last_reset_at` gates it), so a late tick never corrupts occupancy.

## E2E

`apps/web/e2e` has a Playwright suite covering the first vertical slice (anonymous map, check-in,
realtime propagation, observations, geolocation errors) plus the social features built on top of
it (profile privacy, chat realtime + blocking, DMs, reporting without a photo, the PWA manifest).
It expects the API (`wrangler dev` on port 4000, with `PRESENCE_DEV_BYPASS=true`) and the web app (port 3000) to
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
