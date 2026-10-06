# Security checklist

Status of each security measure, with where it lives and how it was checked. Last checked on 2026-10-05 against production (API `uns-study-api` v84, web `sala-de-estudio`).

| Measure | Status | Where | Checked |
|---|---|---|---|
| CSRF | Done | `apps/api/src/common/csrf.middleware.ts` rejects state-changing `/api/v1` requests from origins not in `WEB_ORIGIN`. Better Auth checks `trustedOrigins` on `/api/auth/*`. | `POST /api/v1/checkins` with `Origin: https://evil.example` returns 403 in production. |
| Client validation before sending | Done | `apps/web/src/lib/api.ts`: `apiPost`/`apiPut`/`apiPatch` take a contracts schema and refuse to send an invalid body. | `api-validation.test.ts` |
| Row Level Security | Replaced by an equivalent control | See "Row Level Security" below. | Authorization tests in `apps/api` (403/404 on other users' data). |
| CORS | Done | `main.ts`: `cors({ origin: env.webOrigins, credentials: true })`. | A request with a foreign `Origin` gets no `Access-Control-Allow-Origin` header. |
| Environment variables | Done | All credentials are Fly secrets. Only `.env.example` files are committed. Public web values (GA ID, Turnstile site key) are safe to expose by design and are locked to the production hostname. | `git ls-files` and `git grep` show no committed secrets. |
| Rate limiting | Done | In-memory limit of 300 requests per minute per IP on `/api/v1`. Per-user and per-route limits on every write. Socket.IO event budget and 20 connections per IP. Fly concurrency limit 200/250. | `global-ip-rate-limit.middleware.test.ts`, `socket-bucket.test.ts` |
| Input sanitization | Done | Every body goes through zod contracts (`ZodBodyPipe`) with uuid, length and datetime limits. All SQL goes through Drizzle with bound parameters, so there is no string-built SQL. React escapes output. | contracts and API tests |
| Authentication | Done | Better Auth sessions, validated on the server by `auth.guard.ts` on every protected route. Sessions are revoked on password reset. | `auth.guard.test.ts` |
| Route auth coverage | Done | `route-auth-coverage.http.test.ts` lists every `/api/v1` route and calls it without a session: each one must answer 401 unless it is in `PUBLIC_ROUTES`. A new route that forgot its guard fails CI. Public routes must be added to `PUBLIC_ROUTES` with a reason, and only read-only public data or token/signature endpoints belong there. | `route-auth-coverage.http.test.ts` |
| Authorization | Done | Ownership and role checks in the services. ADMIN only for verified emails in `ADMIN_EMAILS`. Avatars of hidden or blocked users return not found. | service tests |
| Encryption and hashing | Done | TLS at the Fly edge with HSTS. Passwords are hashed by Better Auth (scrypt). IP addresses are stored only as salted hashes (`hashIp`). The database is on Fly's private network only. | |
| Helmet | Done | `main.ts` mounts `helmet()` on the API. | Production response headers |
| Security headers | Done | API: CSP, HSTS, `nosniff`, frame options, COOP/CORP. Web: per-request nonce CSP with `'strict-dynamic'`, HSTS with `preload`, and the remaining headers in `next.config.ts`. | Production headers. Browser console shows no CSP errors. |
| Password recovery links expire | Done | `resetPasswordTokenExpiresIn: 60 * 60` (1 hour). Email is sent from `noreply@saladeestudio.com.ar` through Resend. | `EMAIL_FROM` is set in `fly.toml` and the domain is verified in Resend. |
| Brute-force throttling | Done | `auth-rate-limit.middleware.ts` limits `/api/auth` sign-in, sign-up and reset per IP and per email, and caps the body at 16 KB. | `auth-rate-limit.middleware.test.ts` |
| GET/POST responses | Done | No endpoint returns password hashes, tokens or API keys. Lists are capped: rankings top 100 plus your own row, campaigns 100, and paginated feeds. | Phase 3 review |
| DNS | Done | `saladeestudio.com.ar` on Cloudflare (Free), delegated from NIC Argentina. Records are DNS only, so TLS stays on Fly certificates. | `fly certs check` shows both certificates issued. |
| nginx and Let's Encrypt | Not applicable | Fly's edge is the reverse proxy and issues the certificates. `force_https` redirects HTTP to HTTPS. Request size and concurrency are limited in the app and in `fly.toml`. | |
| VPS ports, root SSH on port 22 | Not applicable | There is no VPS. Only ports 80 and 443 are public, and the database has no public IP. | |
| SSH password login | Not applicable | There is no SSH daemon with passwords. `fly ssh console` uses short-lived certificates tied to the Fly account, so access cannot be locked out by mistake. | |

## Row Level Security

Supabase needs RLS because the browser talks to the database directly with a public key. Here the browser never reaches the database:

- The database has no public address. Only the API reaches it, over Fly's private network.
- The API connects as `sala_app`, which can only read and write rows. It cannot change the schema, and the owner role `sala_owner` has no login between migrations.
- Every query that returns a user's data filters by the session user in the service layer. Tests check that other users' data returns 403 or 404.

Per-user Postgres RLS would require putting the user ID into every database transaction, including the realtime gateway and the background jobs. That is a large change for little extra protection in this design, so it is not done. Revisit it if anything other than the API ever gets database access.

## Neon

The owner deleted the Neon project on 2026-10-05. The database lives only on Fly Postgres.

## Phases run (2026-10-05)

Each phase was implemented by a builder subagent and then checked by a verifier subagent (typecheck, lint, tests, web build), and deployed and checked against production.

| Phase | What was added | Commit |
|---|---|---|
| 1. Auth | Sessions revoked on password reset; 16 KB body cap on `/api/auth` writes. | d4970ba |
| 2. Rate limiting | 300/min per IP on `/api/v1`; Socket.IO event budget and 20 connections per IP; per-user limits on the remaining routes; Fly concurrency limit. | d4970ba |
| 3. Validation and exposure | uuid, length and datetime limits in contracts; QR body validated; hidden users' avatars not served; rankings capped at 100; campaign list capped; unsubscribe stores hashed IPs. | d4970ba |
| 4. Backups and infra docs | Daily volume snapshots kept 14 days; daily `pg_dump` to the owner's PC; restore script tested; Fly infrastructure notes. | d4970ba |
| 5. Web | Per-request CSP nonce with `'strict-dynamic'`; HSTS preload; bodies validated in the browser before sending. | 0804da2 |
| 6. Migrations | The API no longer holds the owner credential and refuses to boot with pending migrations; `ops/migrate-fly-db.ps1` migrates with a one-time owner login. | 0804da2 |
| 7. Audit | This checklist, re-checked against production by a security subagent: 11 pass, 2 partial. | this file |
| 8. Audit fixes | DM unread count done in SQL; notification eligibility in one query (`NOT EXISTS`); every web call with a body now validated with its contracts schema. | see git log |
| 9. Push subscriptions | Another user can take over a push endpoint only by sending the same browser keys; knowing the endpoint URL alone changes nothing. No migration needed. | see git log |
| 10. Review fixes | CSRF middleware also rejects a state-changing request that carries a cookie but neither `Origin` nor `Sec-Fetch-Site`; the web no longer sends `x-powered-by`; HTTP-level IDOR test (`authorization.http.test.ts`) drives the real app with several signed-in users (DMs, push subscriptions, check-ins, admin routes, public profiles). Socket.IO keeps using `fly-client-ip`, which the Fly edge sets. | see git log |
