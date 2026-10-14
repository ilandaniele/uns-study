# Security checklist

Status of each security measure, with where it lives and how it was checked. Last checked on 2026-10-05 against the previous Fly-hosted production. The platform has since moved to Cloudflare Workers (API `uns-api`, web `uns-web`); the rows below describe the Cloudflare setup and must be re-checked against production after the cutover.

| Measure | Status | Where | Checked |
|---|---|---|---|
| CSRF | Done | `apps/api/src/http/middleware/csrf.ts` rejects state-changing `/api/v1` requests from origins not in `WEB_ORIGINS`. Better Auth checks `trustedOrigins` on `/api/auth/*`. | `POST /api/v1/checkins` with `Origin: https://evil.example` returns 403 in production. |
| Client validation before sending | Done | `apps/web/src/lib/api.ts`: `apiPost`/`apiPut`/`apiPatch` take a contracts schema and refuse to send an invalid body. | `api-validation.test.ts` |
| Row Level Security | Replaced by an equivalent control | See "Row Level Security" below. | Authorization tests in `apps/api` (403/404 on other users' data). |
| CORS | Done | `http/app.ts`: `cors({ origin: env.webOrigins, credentials: true })` (production is same-origin, so CORS only matters for local cross-origin dev). | A request with a foreign `Origin` gets no `Access-Control-Allow-Origin` header. |
| Environment variables | Done | All credentials are Worker secrets (`wrangler secret put`) or GitHub Actions secrets. Only `.env.example` files are committed. Public web values (GA ID, Turnstile site key) are safe to expose by design and are locked to the production hostname. | `git ls-files` and `git grep` show no committed secrets. |
| Rate limiting | Done | In-memory limit of 300 requests per minute per IP on `/api/v1`. Per-user and per-route limits on every write. WebSocket event budget and 20 connections per IP. The client IP is `cf-connecting-ip`, set by the Cloudflare edge. | `global-ip-rate-limit.test.ts`, `socket-bucket.test.ts` |
| Input sanitization | Done | Every body goes through zod contracts (`zBody` in `http/validate.ts`) with uuid, length and datetime limits. All SQL goes through Drizzle with bound parameters, so there is no string-built SQL. React escapes output. | contracts and API tests |
| Authentication | Done | Better Auth sessions, validated on the server by the guards in `http/guards.ts` on every protected route. Sessions are revoked on password reset. | `http/http.test.ts` |
| Route auth coverage | Done | `route-auth-coverage.http.test.ts` lists every `/api/v1` route and calls it without a session: each one must answer 401 unless it is in `PUBLIC_ROUTES`. A new route that forgot its guard fails CI. Public routes must be added to `PUBLIC_ROUTES` with a reason, and only read-only public data or token/signature endpoints belong there. | `route-auth-coverage.http.test.ts` |
| Authorization | Done | Ownership and role checks in the services. ADMIN only for verified emails in `ADMIN_EMAILS`. Avatars of hidden or blocked users return not found. | service tests |
| Encryption and hashing | Done | TLS at the Cloudflare edge with HSTS. Passwords are hashed by Better Auth (scrypt). IP addresses are stored only as salted hashes (`hashIp`). The database is the Durable Object's SQLite and has no network address. | |
| Helmet | Replaced by an equivalent control | `http/middleware/security-headers.ts` sets the same headers on the API. | Production response headers |
| Security headers | Done | API: CSP, HSTS, `nosniff`, frame options, COOP/CORP. Web: per-request nonce CSP with `'strict-dynamic'`, HSTS with `preload`, and the remaining headers in `next.config.ts`. | Production headers. Browser console shows no CSP errors. |
| Password recovery links expire | Done | `resetPasswordTokenExpiresIn: 60 * 60` (1 hour). Email is sent from `noreply@saladeestudio.com.ar` through Resend. | `EMAIL_FROM` is set in `apps/api/wrangler.jsonc` and the domain is verified in Resend. |
| Brute-force throttling | Done | `http/middleware/auth-rate-limit.ts` limits `/api/auth` sign-in, sign-up and reset per IP and per email, and caps the body at 16 KB. | `auth-rate-limit.test.ts` |
| GET/POST responses | Done | No endpoint returns password hashes, tokens or API keys. Lists are capped: rankings top 100 plus your own row, campaigns 100, and paginated feeds. | Phase 3 review |
| DNS | Done | `saladeestudio.com.ar` on Cloudflare (Free), delegated from NIC Argentina. Records are proxied (orange cloud) and Cloudflare issues the certificates; the zone routes `/api/*` to `uns-api` and the rest to `uns-web`. | Browser shows a valid certificate on the root and `www`. |
| nginx and Let's Encrypt | Not applicable | Cloudflare's edge is the reverse proxy and issues the certificates, and redirects HTTP to HTTPS. Request size is limited in the app (`http/middleware/body-limits.ts`). | |
| VPS ports, root SSH on port 22 | Not applicable | There is no VPS. Only ports 80 and 443 are public, and the database has no network address. | |
| SSH password login | Not applicable | There is no SSH daemon. Deploys use `wrangler` with a scoped Cloudflare API token, so there is no server login to lock out or brute-force. | |

## Row Level Security

Supabase needs RLS because the browser talks to the database directly with a public key. Here the browser never reaches the database:

- The database is the SQLite storage of the Durable Object. It has no address and no credential; only the Worker code reaches it.
- Every query that returns a user's data filters by the session user in the service layer. Tests check that other users' data returns 403 or 404.

Per-user database-level RLS would require putting the user ID into every database transaction, including the realtime gateway and the background jobs. That is a large change for little extra protection in this design, so it is not done. Revisit it if anything other than the API ever gets database access.

## Historical note

The database previously lived on Neon (deleted 2026-10-05) and then on Fly Postgres, and the app ran on Fly. It moved to Durable Object SQLite on Cloudflare Workers. The measures below were implemented on the earlier platform.

## Phases run (2026-10-05)

Each phase was implemented by a builder subagent and then checked by a verifier subagent (typecheck, lint, tests, web build), and deployed and checked against production.

| Phase | What was added | Commit |
|---|---|---|
| 1. Auth | Sessions revoked on password reset; 16 KB body cap on `/api/auth` writes. | d4970ba |
| 2. Rate limiting | 300/min per IP on `/api/v1`; WebSocket event budget and 20 connections per IP; per-user limits on the remaining routes; platform concurrency limit. | d4970ba |
| 3. Validation and exposure | uuid, length and datetime limits in contracts; QR body validated; hidden users' avatars not served; rankings capped at 100; campaign list capped; unsubscribe stores hashed IPs. | d4970ba |
| 4. Backups and infra docs | Daily volume snapshots kept 14 days; daily `pg_dump` to the owner's PC; restore script tested; infrastructure notes (all since replaced by Durable Object SQLite point-in-time recovery). | d4970ba |
| 5. Web | Per-request CSP nonce with `'strict-dynamic'`; HSTS preload; bodies validated in the browser before sending. | 0804da2 |
| 6. Migrations | The API no longer held the owner credential and refused to boot with pending migrations (obsolete: the Durable Object now applies its own migrations). | 0804da2 |
| 7. Audit | This checklist, re-checked against production by a security subagent: 11 pass, 2 partial. | this file |
| 8. Audit fixes | DM unread count done in SQL; notification eligibility in one query (`NOT EXISTS`); every web call with a body now validated with its contracts schema. | see git log |
| 9. Push subscriptions | Another user can take over a push endpoint only by sending the same browser keys; knowing the endpoint URL alone changes nothing. No migration needed. | see git log |
| 10. Review fixes | CSRF middleware also rejects a state-changing request that carries a cookie but neither `Origin` nor `Sec-Fetch-Site`; the web no longer sends `x-powered-by`; HTTP-level IDOR test (`authorization.http.test.ts`) drives the real app with several signed-in users (DMs, push subscriptions, check-ins, admin routes, public profiles). The WebSocket endpoint uses `cf-connecting-ip`, which the Cloudflare edge sets. | see git log |
