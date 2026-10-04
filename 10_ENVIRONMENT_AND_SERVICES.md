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

Only values intentionally safe for browser exposure should use `NEXT_PUBLIC_`.

## API variables

```env
NODE_ENV=development
PORT=4000

WEB_ORIGIN=http://localhost:3000

DATABASE_URL=

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_REPORT_EVIDENCE=
R2_ENDPOINT=

TURNSTILE_SECRET_KEY=

ROOM_RESET_TIMEZONE=America/Argentina/Buenos_Aires
```

If BullMQ requires a standard Redis connection instead of REST credentials, use the appropriate Upstash Redis connection URL/configuration for the chosen library.

## Better Auth

Do not guess table schema from memory.

Use the Better Auth version installed in the project and its current migration/adapter documentation.

Configure:

- Google;
- credentials/email-password;
- secure cookies in production;
- trusted origins;
- backend session validation.

## Neon

Create one PostgreSQL project/database.

Requirements:

- SSL connection;
- migration user/credentials;
- runtime connection string;
- optional separate migration/runtime roles later.

## Upstash

Uses:

- rate limits;
- security counters;
- ephemeral presence/caches;
- job infrastructure if compatible with chosen queue setup.

## Cloudflare R2

Create private bucket for moderation evidence.

Do not make the bucket publicly readable.

Uploads should have:

- size limit;
- image MIME allowlist;
- random object names;
- report/user metadata stored in DB, not exposed in object path when avoidable.

## Web (Fly.io)

Deploy only `apps/web`.

Configure:

- public API URL;
- public socket URL;
- app origin.

## Railway

Deploy `apps/api`.

Must support persistent WebSocket connections.

Configure:

- database;
- Redis;
- auth;
- R2;
- CORS origins.

## Monetization and email (pending owner accounts)

The code for these features is shipped. Each one turns on when its variables are set. Status as of 2026-10-03:

| Feature | Variables | App | Status | Blocked on |
|---|---|---|---|---|
| Mercado Pago subscriptions | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | `uns-study-api` | not set | owner logs in to Mercado Pago Developers and copies the production Access Token and the webhook secret |
| Transactional email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | `uns-study-api` | `RESEND_API_KEY` set 2026-10-04; `EMAIL_FROM` not set | `EMAIL_FROM` needs a verified sending domain, so it waits for the custom domain |
| AdSense | `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM`, `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED`, `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` | `sala-de-estudio` (build-time) | not set | AdSense approval, which needs a custom root domain (a `*.fly.dev` subdomain is not accepted) |
| Custom domain | Fly certificate plus `BETTER_AUTH_URL` and origin updates | both | none | owner buys the domain (for example `.com.ar` at NIC Argentina, which needs the owner's own clave fiscal) |

To store an API secret without printing it, copy the value to the clipboard and run:

```powershell
powershell -ExecutionPolicy Bypass -File ops\set-secret-from-clipboard.ps1 mp
powershell -ExecutionPolicy Bypass -File ops\set-secret-from-clipboard.ps1 mphook
powershell -ExecutionPolicy Bypass -File ops\set-secret-from-clipboard.ps1 resend
```

Secrets are staged. The API applies them on its next deploy. `/ads.txt` is generated from `NEXT_PUBLIC_ADSENSE_CLIENT`.

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
