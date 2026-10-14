# Load tests (k6)

k6 suite for the UNS Study API: ~108 seats in one room, read-heavy (map revalidation dominates), with rare
writes (check-in "Estoy acá", observations "Está libre / Está ocupado"). Local stacks only.

## Safety

- `BASE_URL` defaults to `http://localhost:4000` (`pnpm --filter @sala/api dev` runs `wrangler dev --port 4000`).
- Every script throws at init if the host is not `localhost` / `127.0.0.1` / `[::1]`, unless `ALLOW_REMOTE=1`
  (for a private test stack you own).
- `saladeestudio.com.ar`, `*.saladeestudio.com.ar` and `*.workers.dev` are refused even with `ALLOW_REMOTE=1`
  (`config/base.js`). URLs with userinfo (`http://localhost@host`), percent-encoding or whitespace in the authority
  are refused outright, and trailing dots (`workers.dev.`) are normalised before the check.
- Test users (`loadtest+<runId>.<n>@example.test`) get a random password per run; nothing is stored in the repo.
  They stay in the target database, so use a disposable one.

## Run

Start the API locally (real geofence, not `PRESENCE_DEV_BYPASS`), then:

```bash
# wrangler dev on port 4000; needs apps/api/.dev.vars (copy .dev.vars.example): NODE_ENV=development,
# WEB_ORIGINS=http://localhost:3000, BETTER_AUTH_URL=http://localhost:4000, BETTER_AUTH_SECRET, IP_HASH_SALT.
# The Durable Object SQLite migrates and seeds the initial room on first request.
pnpm --filter @sala/api dev

pnpm load:smoke    # 1 VU, 30 s: every verified route once, writes included
pnpm load:load     # 60 VUs, ~10 min: normal day
pnpm load:stress   # 50 -> 400 VUs, ~25 min: find the break point
pnpm load:spike    # 10 -> 500 VUs in 30 s, twice: recovery
pnpm load:soak     # 80 VUs, 2 h: latency drift / error creep
pnpm load:peak     # 300 VUs, 15 min: 08:00 exam-season rush
```

Run from the repo root (results are written relative to the working directory).

`wrangler dev` runs the Worker and the Durable Object in a single local `workerd` process, so one Durable Object
serves every VU, as in production. Local numbers are a regression trend, not production capacity.

Install k6: <https://grafana.com/docs/k6/latest/set-up/install-k6/>. The HTML report and summary helpers are
fetched from `raw.githubusercontent.com` / `jslib.k6.io` at start, so a network connection is required.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:4000` | API origin (guarded) |
| `ORIGIN` | `http://localhost:3000` | `Origin` header on writes (CSRF check, must be in the API's `WEB_ORIGINS`) |
| `ALLOW_REMOTE` | unset | `1` to allow a non-local, non-production host |
| `ROOM_SLUG` / `ROOM_LAT` / `ROOM_LNG` | `principal` / `-38.7018942` / `-62.2702852` | Room + geofence centre (seed: `packages/database/src/seed.ts`; recalibrated DBs need overrides) |
| `USERS` | per scenario (60 / 300 / 80 / 150) | Test accounts created in `setup()`; extra VUs are anonymous (read-only) |
| `MAX_VUS` (stress), `PEAK_VUS` (spike) | 400 / 500 | Upper bound of the ramp |
| `SOAK_HOLD` | `2h` | Soak plateau length |
| `SPOOF_CLIENT_IP` | on | `0` to stop sending a per-VU `CF-Connecting-IP` (see below) |
| `RESULTS_DIR` | `tests/load/results` | Where `handleSummary` writes |
| `TARGET_ENV`, `STAGING_BASE_URL`, `STAGING_ORIGIN` | `local` | Placeholder staging profile (`config/environments.js`) |

## Realistic model

Normal use is 50-150 concurrent users; exam-season mornings reach ~300 around 08:00, when everyone opens the map and
tries to sit down (108 seats). Each VU behaves like a student:

- opens the app (parallel: `/me`, room, map, announcements; logged-in VUs also `people` and the realtime token;
  `occupants` is `AuthGuard`-only, so anonymous VUs never call it);
- revalidates the map every 10-40 s with `If-None-Match` (unchanged map = tiny 304);
- sometimes visits rankings, disputes, chat history, DMs, profile, notification preferences, subscription;
- checks in once (presence check first, retries another free seat after `SEAT_TAKEN`), rarely observes, rarely extends.

## Rate-limit pacing

Writes are paced under the limits the API enforces, so any `429` is a finding, not noise (`rate_limited_count`):

| Limit | Where | Pacing |
|---|---|---|
| 300 req/min per IP over `/api/v1` | `http/middleware/global-ip-rate-limit.ts` | Each VU sends its own `CF-Connecting-IP` (`10.x.y.z`). k6 would otherwise look like one IP and hit 429 beyond ~30 VUs. The API reads the client IP from that header; Cloudflare's edge overwrites it, but nothing does against a local `wrangler dev`, so the spoof works only on a local stack (one more reason production is refused). |
| `presence:<user>` 10/min | `presence.router.ts` | one per check-in batch |
| `checkin:<user>` 5/min (counted after the presence pre-check) | `checkins.router.ts` | <= 3 attempts per batch, batches >= 70 s apart |
| `extend:<user>` 5/min | `checkins.router.ts` | >= 20 s apart |
| `observation:<user>` 3/min while the account is < 24 h old (6/min later) | `observations.router.ts`, `abuse-policy.service.ts` | >= 25 s apart |
| distinct observed seats 8 per 10 min (new account) | `observations.service.ts` | <= 7 observations per 10 min |
| sign-up 5/email/hour | `http/middleware/auth-rate-limit.ts` | unique email per user and per run |

Better Auth's own limiter (3 sign-ups/min) is `production`-only (`auth.instance.ts`), so run the API with
`NODE_ENV` != `production` or `setup()` will 429 beyond three users.

Business replies on writes that are not errors: `409 SEAT_TAKEN` (check-in), `409 OWN_SEAT_OBSERVATION` /
`409 SEAT_VERIFIED` (observation), `404 NO_ACTIVE_CHECKIN` (extend/checkout). They count in `business_conflicts`
and are excluded from `http_req_failed`. `401/403/429/5xx` always fail the check and are counted separately.

## What each scenario measures

| Scenario | Custom metrics | Pass/fail focus |
|---|---|---|
| smoke | all routes via tags, `map_304_ratio` | 100% checks, zero 429/5xx, 304 revalidation works |
| load | `map_304_ratio`, `checkin_latency`, `observation_latency`, `map_payload_bytes` | shared budgets (p95 < 500, p99 < 1000, failed < 1%), per-endpoint p95 |
| stress | `stress_degraded{load_bucket}`, `stress_latency{load_bucket}` | break point = first VU bucket with > 5% degraded or p95 > 1 s (`results/stress-breaking-point.json`) |
| spike | `spike_errors{spike_phase}`, `spike_map_latency{spike_phase}` | **recovery** phase back at baseline budgets |
| soak | `soak_latency{window}`, `soak_errors{window}` | per-10-min p95 < 500 and drift ratio last/first steady window <= 1.5 (`results/soak-drift.json`) |
| peak | `time_to_seated`, `seat_conflict_ratio`, `rush_seated`, `open_app_latency`, `checkin_latency` | burst check-ins: latency, seats actually granted (>= 80 of 108) |

Common to all (`config/base.js` `baseThresholds`): `http_reqs{phase:main} count>0` (a run with no traffic fails
instead of passing vacuously), `http_req_failed{phase:main} < 1%` with an `abortOnFail` guard at 50%,
`http_req_duration{phase:main}` p95 < 500 / p99 < 1000, `checks > 99%`, plus `rate_limited_count`,
`endpoint_errors{endpoint,status}`, `server_error_count`, `auth_failure_count` (with an `abortOnFail` guard: a broken
session/CSRF setup fails every authed call and is not a load result), `business_conflicts`, and per-endpoint
`http_req_duration{endpoint:<name>}` thresholds (`endpointBudgets`) declared only for the endpoints the scenario's
profile actually calls (`helpers/flows.js` `endpointsFor`), so no endpoint threshold passes with zero samples.

Relaxed budgets, by design: **stress** failed < 10%, p95 < 2 s, checks > 90%, endpoint budgets x4; **spike** failed
< 15%, p95 < 3 s, checks > 85%, endpoint budgets x6 (the strict verdict is the per-phase recovery thresholds);
**peak** keeps the global p95 < 500 but endpoint budgets x2.

Request tags: every VU request carries `phase:main`; `setup()` sign-ups and discovery carry `phase:setup`
(`endpoint:setup_*`), `teardown()` checkouts `phase:teardown`. Global thresholds sit on the `{phase:main}`
sub-metrics, so slow scrypt sign-ups never move the budgets. Do not reuse `phase` in scenario code (spike uses
`spike_phase`, soak `window`). `setupTimeout` scales with the number of test users (`lifecycleTimeouts`).

Outputs per scenario in `tests/load/results/` (git-ignored): `<scenario>-summary.json`, `<scenario>-report.html`
(k6-reporter pinned to tag `2.4.0`, fetched by k6 at run time), plus the usual text summary on stdout.

## Memory growth (soak)

k6 only sees the client side. For server memory, sample the local `workerd` processes while soaking (the CI workflow writes
their total RSS to `api-rss.csv` every 30 s). For the deployed Worker use the Cloudflare dashboard metrics.

## CI

`.github/workflows/load-tests.yml`: manual dispatch (choose a scenario) and a weekly run of `load`. It boots
`wrangler dev` (API Worker + Durable Object SQLite) from the checked-out commit inside the runner and targets
`localhost`; it has no target-URL input. It does not run on pull requests because `ci.yml` never starts the API
(its tests use in-memory SQLite).
GitHub-hosted runners are small and share CPU with the API: treat their numbers as a regression trend, not capacity.

## Notes

- Setup requests (sign-ups, scrypt hashing) still appear in k6's unfiltered `http_req_duration` line of the text
  summary; thresholds use the `{phase:main}` sub-metric, which excludes them.
- A check-in left behind by a crashed run holds a seat for 180 min; `teardown()` checks every test user out, and
  the next run's `/me` call re-adopts a surviving check-in.
