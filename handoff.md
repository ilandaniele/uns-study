# Handoff / Blueprint — UNS Study MVP

Shared contract for all agents. Specs live in `00_*.md`..`10_*.md` and `CLAUDE.md`. Do NOT change contracts below without telling the orchestrator.

## Environment facts
- Windows 11, Node 24, pnpm 9.15.9, Git Bash available. Docker daemon NOT running.
- No real credentials yet (Neon, Google, Upstash). Everything must run locally without them.
- Package manager: pnpm workspaces + Turborepo. Test runner: Vitest everywhere (API included; use `unplugin-swc` or plain classes — domain services must be testable without Nest DI).

## Layout
```
apps/web        Next.js (App Router, TS, Tailwind v4), port 3000
apps/api        NestJS (TS, Express platform), port 4000, prefix /api/v1
packages/contracts   @uns/contracts   — shared TS types + zod schemas + constants
packages/database    @uns/database    — Drizzle schema, client factory, migrations, seed, layout generator
```
Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed` (turbo / filter). Packages export TS source directly (`"main": "./src/index.ts"`, `"types"` same) — no build step for internal packages; API compiles them via its bundler/ts path (use `tsx`/`swc` for dev; for Nest build use `tsup` or nest-cli with webpack? → decision: API runs with `tsx watch src/main.ts` in dev and `tsup` for build, NOT nest-cli, so workspace TS sources resolve cleanly).

## Database
- Client factory `createDb()` in `@uns/database`:
  - if `DATABASE_URL` set → `drizzle-orm/node-postgres` with `pg` Pool (ssl when url has sslmode).
  - else → `drizzle-orm/pglite` with `@electric-sql/pglite` persisted at `<repo>/.data/pglite` (env `PGLITE_DIR` overrides; `memory://` for tests).
  - Export type `Db` usable by both (use the common `PgDatabase` base type).
- Migrations: drizzle-kit generates SQL into `packages/database/migrations`. `migrate()` helper applies them for both drivers (`drizzle-orm/node-postgres/migrator` / `drizzle-orm/pglite/migrator`).
- Tables (snake_case columns, uuid PK `defaultRandom()` for domain tables, timestamptz):
  - Better Auth tables `user`, `session`, `account`, `verification` (text ids) — schema in `src/schema/auth.ts` matching Better Auth drizzle adapter (generate with `@better-auth/cli generate` against apps/api auth config if possible, else follow installed version docs). Domain FKs reference `user.id` (text).
  - `rooms` (id, slug unique, name, description, latitude double, longitude double, geofence_radius_m int, timezone text, daily_reset_time text 'HH:MM', active bool, last_reset_at timestamptz null, created_at, updated_at)
  - `room_tables` (id, room_id, code, label, type enum `MAIN_TABLE|WALL_BAR`, x,y,width,height real, rotation real, timestamps) unique(room_id, code)
  - `seats` (id, room_id, table_id, code, seat_number int, x,y real, rotation real, active bool, timestamps) unique(room_id, code); index(room_id)
  - `seat_current_state` (seat_id PK FK, status enum `UNKNOWN|FREE|OCCUPIED|UNCERTAIN`, confidence real, source_summary text, last_updated_at, updated_at) index(status)
  - `check_ins` (id, user_id, room_id, seat_id, status enum `ACTIVE|COMPLETED|EXPIRED|CANCELLED`, show_identity bool default false, presence_verified bool, location_accuracy_m real, started_at, expires_at, ended_at null, timestamps). **Partial unique indexes** `uq_checkin_active_user ON (user_id) WHERE status='ACTIVE'`, `uq_checkin_active_seat ON (seat_id) WHERE status='ACTIVE'`. Indexes per spec §5.
  - `seat_observations` (id, user_id, room_id, seat_id, observed_status enum `FREE|OCCUPIED`, presence_verified, qr_verified, confidence_weight real default 1, observed_at, expires_at, timestamps) index(seat_id, expires_at), index(user_id, created_at)
  - `seat_state_events` append-only (id, room_id, seat_id, user_id null, event_type text, old_status, new_status, metadata jsonb, created_at) index(room_id, created_at desc)
  - `security_events` (id, user_id null, event_type, ip_hash null, metadata jsonb, created_at)
  - `user_room_presence` (user_id, room_id, presence_verified, first_seen_at, last_seen_at, active) PK(user_id, room_id)
  - `study_status` (user_id, room_id, subject, message, looking_for_group, active, started_at, updated_at) PK(user_id, room_id) — scaffold only.
  - Later tables (profiles, privacy, reputation, qr, blocks, reports, chat) NOT now.
- Seed (`pnpm db:seed`, idempotent upsert by slug/code): room slug `principal`, name `Sala de Estudio UNS`, lat `-38.70138372483678`, lng `-62.270139753196005` (confirmed), radius 120 m, tz `America/Argentina/Buenos_Aires`, reset `04:00`. Geometry from `generateRoomLayout()` (pure, in `src/layout.ts`, unit-tested: 12 MAIN_TABLE, 4 WALL_BAR, 108 seats, codes `M01-S01`..`M12-S08`, `B01-S01`..`B04-S03`). viewBox `0 0 1000 1600`: back/windows at top y≈0, entrance at bottom. M01..M06 left column bottom→top (M01 near entrance), M07..M12 right column bottom→top. Tables horizontal ~300x90; seats 1-4 above table left→right, 5-8 below right→left. Bars vertical against side walls: B01 left-bottom, B02 right-bottom, B03 left-top, B04 right-top, 3 seats each stacked vertically. One `seat_current_state` row per seat, UNKNOWN, confidence 0.

## Contracts package (`@uns/contracts`)
```ts
export type SeatStatus = 'UNKNOWN'|'FREE'|'OCCUPIED'|'UNCERTAIN';
export type TableType = 'MAIN_TABLE'|'WALL_BAR';
export const CHECKIN_MINUTES = 60, FREE_OBS_MINUTES = 15, OCCUPIED_OBS_MINUTES = 20;
export interface RoomSummary { roomId: string; total: number; free: number; occupied: number; uncertain: number; unknown: number }
export interface RoomDto { id; slug; name; description: string|null; timezone: string }
export interface TableDto { id; code; label; type: TableType; x; y; width; height; rotation }
export interface SeatDto { id; tableId; code; seatNumber; x; y; rotation; status: SeatStatus; confidence: number; lastUpdatedAt: string|null; sourceSummary: string|null }
export interface RoomMapDto { room: RoomDto; summary: RoomSummary; tables: TableDto[]; seats: SeatDto[]; viewBox: {width:1000;height:1600} }
export interface LocationInput { latitude: number; longitude: number; accuracy: number; capturedAt: string }
export interface PresenceResult { valid: boolean; reason: PresenceRejectReason|null; expiresAt: string|null }
export type PresenceRejectReason = 'INVALID_COORDINATES'|'STALE_LOCATION'|'POOR_ACCURACY'|'OUTSIDE_GEOFENCE'|'ROOM_NOT_FOUND';
export interface CheckInDto { id; roomId; seatId; seatCode: string; status; startedAt; expiresAt; showIdentity: boolean }
export interface MeDto { user: {id; name; email; image: string|null} | null; activeCheckIn: CheckInDto|null }
// socket
export const SocketEvents = { RoomJoin:'room:join', RoomLeave:'room:leave', SeatStateChanged:'seat:state-changed', RoomSummaryChanged:'room:summary-changed', RoomDailyReset:'room:daily-reset' } as const;
export interface SeatStateChangedEvent { roomId; seatId; status: SeatStatus; confidence: number; lastUpdatedAt: string }
// zod: locationInputSchema, checkInRequestSchema {roomId, seatId, location, showIdentity?:bool=false, qrToken?:string|null}, observationRequestSchema {roomId, seatId, status:'FREE'|'OCCUPIED', location, qrToken?}, extendRequestSchema {location}, presenceValidateSchema {roomId, ...location}
// ApiError body: { error: { code: string; message: string } } — codes: UNAUTHENTICATED, PRESENCE_REJECTED (+reason), SEAT_TAKEN, SEAT_NOT_FOUND, NO_ACTIVE_CHECKIN, RATE_LIMITED, VALIDATION_ERROR
```

## API (apps/api) — REST `/api/v1`
- `GET /rooms`, `GET /rooms/:idOrSlug`, `GET /rooms/:idOrSlug/map` (public). Map reads derive expired signals lazily (treat `expires_at <= now()` as expired).
- `GET /me` → MeDto (anon allowed → user null).
- `POST /presence/validate` (auth).
- `POST /checkins` (auth, rate limit 5/min, presence), `DELETE /checkins/current`, `POST /checkins/current/extend` (fresh presence, +60 min from now).
- `POST /observations` (auth, rate limit 6/min + max 15 distinct seats / 10 min, presence). Cannot observe a seat where caller has own active check-in (just use check-in). Duplicate observation by same user same seat replaces (expire previous).
- Better Auth mounted at `/api/auth/*` (Express handler BEFORE body parser), email/password enabled, Google enabled only when `GOOGLE_CLIENT_ID` set. `trustedOrigins=[WEB_ORIGIN]`. Guard `AuthGuard` resolves session via `auth.api.getSession({headers})` → `req.user`. Never trust body userId.
- Dev-only presence bypass: env `PRESENCE_DEV_BYPASS=true` (rejected when NODE_ENV=production) makes presence always valid — for local testing away from UNS. Thresholds env: `PRESENCE_MAX_AGE_S=120`, `PRESENCE_MAX_ACCURACY_M=100`.
- Domain services (pure-ish, no controller logic): `PresenceService` (haversine, validate), `SeatStateCalculator` (pure fn), `CheckInService`, `ObservationService`, `RoomStateService` (recompute seat state + summary, write seat_current_state + events), `RateLimitService` (Upstash REST if env set, else in-memory sliding window), `SecurityEventService`, `RoomRealtimeGateway` (Socket.IO, CORS WEB_ORIGIN, anonymous join allowed), `ExpirationJob` (@nestjs/schedule, every 30 s: expire ACTIVE check-ins with expires_at<=now, recompute seats with just-expired observations, emit), `DailyResetJob` (every minute check: if room local time ≥ reset time and last_reset_at < today's reset instant → run reset txn per spec §7 + set last_reset_at; idempotent; emit room:daily-reset).
- SeatStateCalculator rules (deterministic): active check-in → OCCUPIED 0.98 source `CHECK_IN`; else active obs: only FREE → FREE conf min(0.5+0.15·(n-1),0.9); only OCCUPIED → OCCUPIED same formula; both → compare weighted counts: if one side ≥ 2× other and newest obs is that side → that side conf 0.5, else UNCERTAIN 0.4; none → UNKNOWN 0. Distinct users count once (latest per user).
- Concurrency: check-in in a transaction; rely on partial unique index; catch unique violation (23505) → SEAT_TAKEN. Moving = mark previous ACTIVE → COMPLETED in same txn before insert.
- After commit emit `seat:state-changed` for each changed seat + `room:summary-changed`.

## Web (apps/web)
- `/` redirects to `/sala/principal`. `/sala/[slug]`: summary counters, `RoomMap` (SVG, components `StudyTable`, `WallBar`, `Seat`), legend, freshness, seat detail bottom sheet (mobile) / side panel (desktop). Spanish copy per `06_UI_UX_SPEC.md`. Colors: FREE green, OCCUPIED red, UNCERTAIN amber, UNKNOWN gray, MY_SEAT blue (+ icon/pattern). Pinch/zoom via simple pan/zoom (e.g. `react-zoom-pan-pinch`) on mobile.
- Data: REST fetch `NEXT_PUBLIC_API_URL/api/v1/rooms/:slug/map` (credentials include) → socket.io-client join `room:join` → apply events; on reconnect refetch map.
- Auth: `better-auth/react` client with `baseURL = NEXT_PUBLIC_API_URL`. `/login` page: email/password sign in/up + Google button. Header shows user + logout.
- Geolocation helper `getFreshLocation()` returning LocationInput or typed error (permission denied / timeout / unavailable). Actions `Estoy acá`, `Está libre`, `Está ocupado`, `Salir` (checkout), `Seguir acá` (extend). Show friendly errors per spec. After first check-in ask identity visibility (store choice only locally for now; default private).

## Web notes
- `apps/web` scaffolded by hand (no `create-next-app`): Next.js 16.3.6, App Router, React 19, Tailwind v4 (`@tailwindcss/postcss`, `@theme` tokens in `globals.css`), TS, port 3000. `next.config.ts` sets `transpilePackages: ["@uns/contracts"]`.
- `src/lib/api.ts` — `apiFetch`/`apiPost`/`apiDelete`, `credentials: "include"`, throws `ApiRequestError { code, reason?, status }` parsed from the `{error:{code,message}}` shape (reads an optional `reason` defensively even though it's not in the `ApiError` TS type — API should include it for `PRESENCE_REJECTED` per handoff prose).
- `src/lib/auth-client.ts` — `better-auth/react` client, `baseURL = NEXT_PUBLIC_API_URL` (default session/social endpoints under `/api/auth/*`).
- `src/lib/geolocation.ts` — `getFreshLocation()`, `enableHighAccuracy/maximumAge:0/timeout:15s`, throws `GeolocationRequestError` with codes `PERMISSION_DENIED|TIMEOUT|UNAVAILABLE`.
- `src/lib/socket.ts` — singleton `socket.io-client`, `withCredentials: true`, base `NEXT_PUBLIC_SOCKET_URL`.
- `src/lib/errors.ts` — maps geolocation/API errors to the exact Spanish copy from `06_UI_UX_SPEC.md` §6 + `SEAT_TAKEN`/`RATE_LIMITED` copy from the work item.
- `src/lib/identity-prefs.ts` — localStorage-only show-identity preference (TODO backend persistence, as instructed).
- `src/features/room/` — `useRoomState` (map + `/me` fetch, socket join/reconnect/refetch, applies `seat:state-changed`/`room:summary-changed`/`room:daily-reset`), `useSeatActions` (check-in/observation/extend/checkout, presence-aware error mapping), `RoomMap`/`StudyTable`/`WallBar`/`Seat` (pure SVG from `RoomMapDto`, no hardcoded geometry; `MY_SEAT` is a client-only overlay computed from `me.activeCheckIn.seatId`), `SeatDetail`, `SummaryCounters`, `Legend`, `IdentityPrompt`, `format.ts` (status label / confidence wording / recency — unit tested).
- `/sala/[slug]/page.tsx` uses `useParams()` (not the async `params` prop) since it's a client component; mobile wraps `RoomMap` in `react-zoom-pan-pinch`, desktop uses a 3-column grid (counters/legend | map | seat panel) per the mockup, with a mobile bottom-sheet duplicate of `SeatDetail`.
- `eslint-config-next`'s `dist/index.js` is already a flat-config array in this version — importing it directly (no `FlatCompat`) avoids a `Converting circular structure to JSON` crash seen with `@eslint/eslintrc` + ESLint 9.39 + `eslint-plugin-react`.
- New `eslint-plugin-react-hooks` v6 rule `react-hooks/set-state-in-effect` (ships with `eslint-config-next` 16) flags the standard "fetch on mount" and "sync prompt to a prop" effects; both are deliberate and disabled inline with a comment.
- Deviation: the UX spec's "Tenés que estar en la sala para actualizar lugares" (logged in but not geofence-validated) message is **not** shown pre-emptively — `MeDto` has no live presence flag, so it can only be surfaced reactively via `PRESENCE_REJECTED`/`OUTSIDE_GEOFENCE` after an action is attempted (same copy, shown via `actionError`). If the API adds a presence flag to `/me` later, this can become proactive.
- Verified: `pnpm --filter @uns/web typecheck|lint|build|test` all pass (7 vitest cases for `format.ts`). Did not run against a live API — no smoke test was done since it wasn't required and `apps/api` wasn't ready at the time of this work; contract types were used as-is.

## Status log
- [x] P0 scaffold  - [x] P1 DB/seed  - [x] P2 map  - [x] P3 auth  - [x] P4 presence  - [x] P5 check-in  - [x] P6 realtime  - [x] P7 observations  - [x] P8 expiry/reset  - [x] P9 anti-abuse
- [x] Security review (Fable) findings fixed  - [x] Playwright E2E 4/4  - [x] API dist bundles workspace packages  - [x] PGlite single-process lock

## Deployment state (2026-09-27)
- GitHub: private repo `ilandaniele/uns-study`, CI green.
- Web: Vercel project `uns-study`, https://uns-study.vercel.app (auto-deploy on push to main). `/api/auth/*` and `/api/v1/*` are rewritten to the API (`API_PROXY_TARGET`), so auth cookies are first-party. Socket.IO connects straight to the API host (defaults to `API_PROXY_TARGET` at build, see next.config.ts).
- API: Render Blueprint `uns-study` (render.yaml) -> web service `uns-study-api` (https://uns-study-api.onrender.com, free plan, sleeps when idle), Render Postgres `uns-study-db` (free, expires after 30 days -> move to Neon project `uns-study` by setting DATABASE_URL), Render Key Value `uns-study-kv` (rate limits via REDIS_URL). Start command runs migrate + seed.
- Admin: `ADMIN_EMAILS=ilan.daniele@gmail.com`; the ADMIN role is granted on the first `/me` after that account signs up.
- Room coordinates confirmed: -38.70138372483678, -62.270139753196005, radius 120 m, max accuracy 100 m.
- Unused but created: Neon project `uns-study` (Sao Paulo), Upstash Redis `uns-study` (Sao Paulo).

## Next (blocked on Ilan)
- Real credentials: Neon `DATABASE_URL`, Google OAuth client, Upstash Redis, Turnstile keys.
- Room coordinates confirmed (2026-09-27). Geofence radius 120 m — tune after real-device tests.
- Deploy: Vercel (apps/web) + Railway (apps/api); see README "Deploy".
- Beta launch point reached per 08_IMPLEMENTATION_PLAN.md; later phases (profiles, chat, reports, rankings, QR, ads) not started.

(apps/api backend complete per the API contract above; apps/web is a separate work item.)

## API notes (apps/api)

**Run**
- Dev: `pnpm --filter @uns/api dev` (`tsx watch src/main.ts`, loads root `.env` via `dotenv`). Set `PRESENCE_DEV_BYPASS=true` to test away from the UNS geofence.
- Seed local data: `pnpm db:seed` (writes to `.data/pglite` when `DATABASE_URL` is unset — **stop the API before seeding and restart after**, PGlite does not support two processes writing the same on-disk store concurrently).
- Build: `pnpm --filter @uns/api build` (tsup → `dist/main.js`, ESM). Start: `pnpm --filter @uns/api start`.
- Tests: `pnpm --filter @uns/api test` (vitest, pglite `memory://`, 40 tests, all green). `typecheck` / `lint` also green.
- `DB_AUTO_MIGRATE` (default `true` outside production) runs `migrate()` on boot; it does **not** seed — run `pnpm db:seed` once against the same store.

**Env** — see root `.env.example`; new API-only var: `DB_AUTO_MIGRATE` (bool, default true in dev). `IP_HASH_SALT` was added (not previously in the example) for `security_events.ip_hash`; defaults to an insecure dev value with no runtime warning — set it for anything beyond local dev.

`TURNSTILE_SECRET_KEY` (Phase 9): unset by default, which fully disables the anti-abuse challenge (`TurnstileService.isEnabled()` false, `AbusePolicyService.requiresChallenge()` always false, no `POST /checkins`/`POST /observations` requests are ever challenged) — matches local dev with no credentials. Set it to enable server-side verification against Cloudflare's `siteverify` endpoint; the web app then needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (added to `.env.example`, web-side widget wiring is `apps/web`'s responsibility) to actually render a challenge and produce a token for the `turnstileToken` field.

**Deviations / notes**
- DI: tsx/esbuild does not emit `design:paramtypes`, so every constructor param across the app uses explicit `@Inject(Token)` (classes-as-tokens for services, symbols for `DB`/`AUTH`). Domain services (`PresenceService`, `SeatStateCalculator` as a pure fn, `RoomStateService`, `CheckInService`, `ObservationService`, `RateLimitService`, `SecurityEventService`, `DailyResetJob`, `ExpirationJob`) are plain classes and are instantiated directly with `new` in tests, bypassing Nest entirely, per the blueprint.
- `AUTH` DI token lives in `src/auth/auth.tokens.ts` (not `auth.module.ts`) to break an import cycle between `AuthModule` → `MeController` → `AuthGuard` → (token).
- Map reads (`GET /rooms/:idOrSlug/map`) recompute seat status live from active check-ins + non-expired observations rather than trusting the persisted `seat_current_state` row, so a stale row (not yet swept by `ExpirationJob`, which runs every 30s) never leaks to clients; the persisted row is only used as a `lastUpdatedAt` fallback when nothing changed.
- `SeatStateCalculator` conflict rule interpreted as: dominant side needs both `weightSum >= 2x` the other side's `weightSum` **and** the single newest observation must belong to that side; otherwise `UNCERTAIN`/0.4. Verified in `src/rooms/seat-state-calculator.test.ts`.
- `RateLimitService`: three backends, tried in order — Upstash Redis (REST, lazily-created/cached limiters per `(limit, windowSeconds)` pair) when `UPSTASH_REDIS_REST_URL`/`TOKEN` are set; otherwise a standard Redis server via `REDIS_URL` (`ioredis`, sliding-window-log per key using a `MULTI` of `ZREMRANGEBYSCORE`/`ZADD`/`ZCARD`/`PEXPIRE`, keyed `rl:<key>`, fails closed on Redis errors); otherwise an in-memory sliding window (dev/test only — throws at construction in production if neither Redis backend is configured). Local dev has none of these set, so it falls all the way to in-memory — verified via `rate-limit.service.test.ts` (in-memory + a `ioredis-mock`-backed test of the Redis window).
- Better Auth 1.7.6 drizzle adapter mounted at `/api/auth/*` on the raw Express instance (`bodyParser: false` on the Nest app, `toNodeHandler(auth)` mounted before `express.json()`). Verified live: sign-up, cookie session, and `GET /api/v1/me` all work end-to-end.
- `POST /observations` rejects observing the seat where the caller has their own active check-in with a generic `VALIDATION_ERROR` (no dedicated `ApiErrorCode` exists for this in the contract) — flagged here since it's the one place the contract's fixed `ApiErrorCode` union felt incomplete; not changed unilaterally.
- Phase 9 anti-abuse: `security/turnstile.service.ts` (Cloudflare `siteverify`, fail-closed, disabled unless `TURNSTILE_SECRET_KEY` set) + `security/abuse-policy.service.ts` (`requiresChallenge(userId)`: true iff Turnstile enabled AND user has a `SEAT_TOGGLE_RAPID`/`OBSERVATION_SPREAD`/`RATE_LIMITED` `security_events` row in the last 30 min; `observationLimits(userId)`/`isNewAccount(userId)`: accounts younger than 24h get 3 observations/min + an 8-distinct-seat/10-min cap instead of 6/15, numbers live in `OBSERVATION_LIMITS`). Both checks live in `CheckInsController`/`ObservationsController` right after the existing rate-limit check (which now also records a `RATE_LIMITED` security event on the 429 path, since that's one of the three challenge triggers); `ObservationService` itself now asks `AbusePolicyService` for the distinct-seat cap instead of a hardcoded constant. A hit records `TURNSTILE_FAILED` only when a token was actually submitted and rejected (a *missing* token when challenged is not itself logged as a failure).
- **Contract note (not changed unilaterally):** the handoff's "API" section literally specifies `ApiError body: { error: { code, message, reason? } }`, but `@uns/contracts`' actual `ApiError` TS interface (`packages/contracts/src/index.ts`) only has `{ code, message }` — no `reason`. The API implements the prose (emits `reason` for `PRESENCE_REJECTED`, matching the web agent's defensive parsing noted above), but `ApiError`/`ApiException` in `apps/api` type the field as optional so JSON output matches prose while staying a structural superset of the contract type. If someone owns `@uns/contracts`, consider adding `reason?: PresenceRejectReason` to `ApiError.error` to close this gap.

**Endpoints verified live** (`PRESENCE_DEV_BYPASS=true`, port 4000):
- `GET /api/v1/health` → 200 `{ok:true,ts}`.
- `GET /api/v1/rooms/principal/map` → 108 seats, `summary.unknown === 108` on a fresh seed.
- `POST /api/auth/sign-up/email` (test@example.test) → session cookie set.
- `GET /api/v1/me` (with cookie) → real user, `activeCheckIn: null`.
- `POST /api/v1/checkins` on a seat → 201, seat becomes `OCCUPIED` (confidence 0.98, `sourceSummary: "CHECK_IN"`) on the very next map read; `summary.occupied === 1`.
- Server stopped cleanly after verification; `.data/pglite` removed so the repo is left clean for the next run/seed.

**Open issues / left for other agents**
- `apps/web` not touched (per scope).
- No real Neon/Upstash/Google credentials configured — everything above ran against local PGlite + in-memory rate limiting, as expected for this stage.
- UNS Bahía Blanca coordinates in the seed are still the placeholder noted in `packages/database/src/seed.ts` (`TODO confirm`) — not this work item's scope.
