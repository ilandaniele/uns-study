# Environment and External Services

Do not commit real secrets.

Create `.env.example` files for web and API.

## Web variables

Example names only:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

In production the web and the API share the origin `saladeestudio.com.ar` (the zone routes `/api/*` to the API Worker), so these point at the same host and the Next rewrites to the API are for local dev only.

Only values intentionally safe for browser exposure should use `NEXT_PUBLIC_`.

## API variables

Worker vars and secrets (local: `apps/api/.dev.vars`, copied from `apps/api/.dev.vars.example`; production: non-secret values in `apps/api/wrangler.jsonc` `vars`, secrets with `wrangler secret put`). There is no `DATABASE_URL`: the database is the SQLite inside the Durable Object.

```env
NODE_ENV=development

WEB_ORIGINS=http://localhost:3000

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000
IP_HASH_SALT=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_ENDPOINT=

TURNSTILE_SECRET_KEY=
```

The report-evidence bucket is also bound to the Worker as `EVIDENCE` (`r2_buckets` in `apps/api/wrangler.jsonc`).

The daily-reset timezone is not an env var: it comes from each room's `rooms.timezone` column (`America/Argentina/Buenos_Aires` for the initial room).

## Better Auth

Do not guess table schema from memory.

Use the Better Auth version installed in the project and its current migration/adapter documentation.

Configure:

- Google;
- credentials/email-password;
- secure cookies in production;
- trusted origins;
- backend session validation.

## Database (Durable Object SQLite)

Since the Cloudflare migration the database is the SQLite storage of the singleton Durable Object `AppDO` in the `uns-api` Worker, accessed through Drizzle (`drizzle-orm/durable-sqlite`). It replaced the self-managed Fly Postgres app (which had replaced Neon). There is no connection string and no credential to protect: only the Worker code can reach it.

### Migrations

Drizzle migrations live in `packages/database/migrations` and are bundled into the Worker. `AppDO` applies the pending ones in its constructor (inside `blockConcurrencyWhile`) and then seeds the initial room, so a deploy migrates the database on the first request. Migrations must stay backward compatible with the code that may still be running during a deploy (add, do not drop or rename).

### Backups and recovery

- Durable Object SQLite has point-in-time recovery (30 days) through Cloudflare.
- `/api/v1/__ops/export` and `/api/v1/__ops/import` (gated by the `OPS_IMPORT_TOKEN` secret; empty means disabled) stream the tables as NDJSON, used for the Fly to Cloudflare data migration and for off-platform backups.
- `MAINTENANCE_MODE=1` answers every `/api/*` path except `/api/v1/health*` with 503 while data is being imported.

## Infrastructure security on Cloudflare

There is no VPS. TLS, ports and DDoS protection are handled by Cloudflare:

- TLS terminates at the Cloudflare edge with managed certificates. Only ports 80 and 443 are public; there is no database endpoint to expose.
- There is no SSH daemon. Deploys use `wrangler` with a scoped API token held in GitHub Actions secrets.
- DNS for `saladeestudio.com.ar` is on Cloudflare (Free plan), delegated from NIC Argentina. The `@` and `www` records are proxied (orange cloud) and the zone routes `saladeestudio.com.ar/api/*` to `uns-api` and everything else to `uns-web`.
- The API trusts `cf-connecting-ip` for the client IP; it is set by the edge and cannot be forged by the client. There is no proxy shared secret.
- Plan: Workers Paid (USD 5/month).

## Cloudflare R2

Create private bucket for moderation evidence.

Do not make the bucket publicly readable.

Uploads should have:

- size limit;
- image MIME allowlist;
- random object names;
- report/user metadata stored in DB, not exposed in object path when avoidable.

## Web (Cloudflare Workers)

Deploy only `apps/web`, as the `uns-web` Worker via OpenNext (`apps/web/wrangler.jsonc`).

Configure:

- public API URL (same origin in production);
- public socket URL (same origin; the browser opens `wss://<host>/api/v1/realtime/ws`);
- app origin.

## API (Cloudflare Workers)

Deploy `apps/api` as the `uns-api` Worker (`apps/api/wrangler.jsonc`).

WebSockets use the Hibernation API inside the Durable Object, so idle connections do not keep the object running.

Configure:

- Worker vars and secrets (database is built in);
- auth;
- R2 binding;
- web origins (`WEB_ORIGINS`).

Deploys run from GitHub Actions with wrangler on push to main.

## Monetization and email (pending owner accounts)

The code for these features is shipped. Each one turns on when its variables are set. Status as of 2026-10-03:

| Feature | Variables | App | Status | Blocked on |
|---|---|---|---|---|
| Mercado Pago subscriptions | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | `uns-api` | both set 2026-10-04 (app "Sala de Estudio", 4960911583819408). Production webhook must point at `https://saladeestudio.com.ar/api/v1/webhooks/mercadopago` with the "Planes y suscripciones" event. A signed MP simulation passed signature checks | nothing; move the webhook URL if the API domain changes |
| Transactional email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | `uns-api` | `RESEND_API_KEY` set 2026-10-04. `saladeestudio.com.ar` added in Resend (São Paulo) on 2026-10-05, with its DKIM, SPF (`send`, `rsend`) and DMARC records on Cloudflare. `EMAIL_FROM` is `Sala de Estudio <noreply@saladeestudio.com.ar>` in `apps/api/wrangler.jsonc`. The domain was verified in Resend on 2026-10-05 | nothing |
| AdSense | `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM`, `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED`, `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` | `uns-web` (build-time) | `NEXT_PUBLIC_ADSENSE_CLIENT` is set in the web build environment, so the web serves `/ads.txt` and the `google-adsense-account` meta tag. On 2026-10-05 the owner added `saladeestudio.com.ar` in AdSense (`pub-1784864280582108`): ownership was verified, a review was requested, and the Google CMP consent message (3 choices) was chosen for EEA/UK/CH visitors. Ad units `sala-room-bottom`, `sala-community-feed` and `sala-rail` exist and their slot IDs are set in the web build environment | Google approving the site; ads fill after that |
| Custom domain | Zone routes plus `BETTER_AUTH_URL` and origin updates | both | `saladeestudio.com.ar` bought 2026-10-05. Google OAuth redirect URI and origin, the Turnstile hostname and the R2 CORS origin were added. `www` 308-redirects to the root. DNS is live on Cloudflare (delegated from NIC Argentina 2026-10-05); `/api/*` routes to `uns-api` and the rest to `uns-web` | nothing |

To store an API secret without printing it, run the command from `apps/api` and paste the value at the prompt (it is not echoed):

```powershell
pnpm exec wrangler secret put MP_ACCESS_TOKEN
pnpm exec wrangler secret put MP_WEBHOOK_SECRET
pnpm exec wrangler secret put RESEND_API_KEY
```

Worker secrets apply immediately (a new Worker version is created). `/ads.txt` is generated from `NEXT_PUBLIC_ADSENSE_CLIENT`.

## Local development

Claude should create clear commands, ideally:

```bash
pnpm install
pnpm dev
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
```

Names can vary slightly but should be documented in root README.
