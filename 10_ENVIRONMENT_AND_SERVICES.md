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
```

The daily-reset timezone is not an env var: it comes from each room's `rooms.timezone` column (`America/Argentina/Buenos_Aires` for the initial room).

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

Since 2026-10-05 the database runs on the self-managed Fly Postgres app `sala-de-estudio-db` (gru, `flyio/postgres-flex:17`, one machine, 1 GB volume with daily snapshots kept 14 days). It was moved from Neon with a one-off script (removed; see git history).

- Database `sala`, reached by the API over Fly's private network at `sala-de-estudio-db.internal:5432` with `sslmode=disable`.
- The owner role `sala_owner` has no login. `ops/migrate-fly-db.ps1` unlocks it only while migrations run (see "Migrations").
- `DATABASE_URL` uses the least-privilege role `sala_app` (data access only, grants in `ops/sala-app-grants.sql`).
- The Neon project `uns-study` was deleted by the owner on 2026-10-05.

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
- DNS for `saladeestudio.com.ar` is on Cloudflare (Free plan), delegated from NIC Argentina. The A and AAAA records for `@` and `www` point at the `sala-de-estudio` Fly IPs and are DNS only (grey cloud), so Fly issues and serves the certificates.

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
| Transactional email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | `uns-study-api` | `RESEND_API_KEY` set 2026-10-04. `saladeestudio.com.ar` added in Resend (São Paulo) on 2026-10-05, with its DKIM, SPF (`send`, `rsend`) and DMARC records on Cloudflare. `EMAIL_FROM` is `Sala de Estudio <noreply@saladeestudio.com.ar>` in `fly.toml`. The domain was verified in Resend on 2026-10-05 | nothing |
| AdSense | `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_ROOM_BOTTOM`, `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED`, `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` | `sala-de-estudio` (build-time) | `NEXT_PUBLIC_ADSENSE_CLIENT` is set in `fly.web.toml`, so the web serves `/ads.txt` and the `google-adsense-account` meta tag. On 2026-10-05 the owner added `saladeestudio.com.ar` in AdSense (`pub-1784864280582108`): ownership was verified, a review was requested, and the Google CMP consent message (3 choices) was chosen for EEA/UK/CH visitors. Ad units `sala-room-bottom`, `sala-community-feed` and `sala-rail` exist and their slot IDs are set in `fly.web.toml` (web v24) | Google approving the site; ads fill after that |
| Custom domain | Fly certificate plus `BETTER_AUTH_URL` and origin updates | both | `saladeestudio.com.ar` bought 2026-10-05. Fly certificates created for the root and `www`. Google OAuth redirect URI and origin, the Turnstile hostname and the R2 CORS origin were added. `www` and `sala-de-estudio.fly.dev` 308-redirect to the root. DNS is live on Cloudflare (delegated from NIC Argentina 2026-10-05) and both Fly certificates are issued | nothing |

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
