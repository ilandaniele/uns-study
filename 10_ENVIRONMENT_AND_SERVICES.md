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

## PostgreSQL (Fly Postgres, previously Neon)

Since 2026-10-05 the database runs on the self-managed Fly Postgres app `sala-de-estudio-db` (gru, `flyio/postgres-flex:17`, one machine, 1 GB volume with daily snapshots kept 14 days). It was moved from Neon with `ops/migrate-neon-to-fly-postgres.ps1`.

- Database `sala`, reached by the API over Fly's private network at `sala-de-estudio-db.internal:5432` with `sslmode=disable`.
- The owner role `sala_owner` has no login. `ops/migrate-fly-db.ps1` unlocks it only while migrations run (see "Migrations").
- `DATABASE_URL` uses the least-privilege role `sala_app` (data access only, same grants as `ops/neon-least-privilege.sql`).
- The Neon project `uns-study` (Postgres 18) is no longer used and is being deleted by the owner.

### Backups and recovery

- Fly takes a daily snapshot of the volume and keeps it 14 days. Snapshots are free under 10 GB.
- `ops/backup-fly-db.ps1` downloads a `pg_dump` of `sala` into `backups/` (gitignored) and keeps 30 days of dumps. The Windows scheduled task "Sala DB backup" (registered by `ops/schedule-fly-db-backup.ps1`) runs it every day at 13:00, or at the next start if the PC was off.
- If the DB machine crashes, Fly restarts it (restart policy `always`) and the data stays on the volume.
- If the data is lost or bad, `ops/restore-fly-db.ps1` restores the latest dump. Without arguments it restores into the test database `sala_restore_test`. `-Database sala -Force` replaces the live data in one transaction.
- If the whole volume is lost, create a new volume from a snapshot. The steps are in the header of `ops/restore-fly-db.ps1`.

### Migrations

The API machine only holds `DATABASE_URL` (role `sala_app`, data changes only). It does not hold the owner credential and never changes the schema. On boot it checks that every migration in the repo is already applied; if any is missing it stops with an error listing them, and the Fly bluegreen deploy keeps the previous version running. The seed and the secret/VAPID setup only read and write rows, so they run as `sala_app`.

Migrations are applied from your PC with `powershell -ExecutionPolicy Bypass -File ops\migrate-fly-db.ps1`. The script gives `sala_owner` a random one-time password, opens `fly proxy` to the database, runs `pnpm db:migrate` against it, then closes the proxy and removes the owner's login again (even if the migration failed). The owner has no login between runs. It also lets `sala_app` read the `drizzle` schema, which the boot check needs.

A commit that changes the schema must run this script before it is pushed. Migrations must stay backward compatible with the code still running (add, do not drop or rename), because the old version keeps serving until the new one boots. `MIGRATION_DATABASE_URL` must not be set as an API secret; if it is, the API migrates with it as before.

## Infrastructure security on Fly.io

There is no VPS. TLS, ports and SSH are handled by Fly:

- TLS terminates at the Fly edge with managed certificates, and `force_https` is on for both apps. nginx and Let's Encrypt are not needed.
- Only ports 80 and 443 are public. The database has no public IP and is reachable only over the private network.
- There is no SSH daemon with passwords or root login. `fly ssh console` uses short-lived certificates issued to the Fly account.
- DNS is needed only when the custom domain is bought.

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
| Mercado Pago subscriptions | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | `uns-study-api` | both set 2026-10-04 (app "Sala de Estudio", 4960911583819408). Production webhook points at `https://uns-study-api.fly.dev/api/v1/webhooks/mercadopago` with the "Planes y suscripciones" event. A signed MP simulation passed signature checks | nothing; move the webhook URL if the API domain changes |
| Transactional email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | `uns-study-api` | `RESEND_API_KEY` set 2026-10-04; `EMAIL_FROM` not set | `EMAIL_FROM` needs a verified sending domain, so it waits for the custom domain |
| AdSense | `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM`, `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED`, `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` | `sala-de-estudio` (build-time) | not set | The owner's AdSense account exists (`pub-1784864280582108`, Montevideo time zone, UYU currency), but it has no Sites section, so no website can be added yet. Approval needs a custom root domain, because a `*.fly.dev` subdomain is not accepted |
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
