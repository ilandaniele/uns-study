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
| Authorization | Done | Ownership and role checks in the services. ADMIN only for verified emails in `ADMIN_EMAILS`. Avatars of hidden or blocked users return not found. | service tests |
| Encryption and hashing | Done | TLS at the Fly edge with HSTS. Passwords are hashed by Better Auth (scrypt). IP addresses are stored only as salted hashes (`hashIp`). The database is on Fly's private network only. | |
| Helmet | Done | `main.ts` mounts `helmet()` on the API. | Production response headers |
| Security headers | Done | API: CSP, HSTS, `nosniff`, frame options, COOP/CORP. Web: per-request nonce CSP with `'strict-dynamic'`, HSTS with `preload`, and the remaining headers in `next.config.ts`. | Production headers. Browser console shows no CSP errors. |
| Password recovery links expire | Done in code | `resetPasswordTokenExpiresIn: 60 * 60` (1 hour). | Turns on when `EMAIL_FROM` is set, which needs the custom domain. |
| Brute-force throttling | Done | `auth-rate-limit.middleware.ts` limits `/api/auth` sign-in, sign-up and reset per IP and per email, and caps the body at 16 KB. | `auth-rate-limit.middleware.test.ts` |
| GET/POST responses | Done | No endpoint returns password hashes, tokens or API keys. Lists are capped: rankings top 100 plus your own row, campaigns 100, and paginated feeds. | Phase 3 review |
| DNS | Not needed yet | Needed only when the custom domain is bought. | |
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

Neon is no longer used. Deleting the Neon project permanently deletes data, so the owner does it from the Neon console. Claude does not delete it.
