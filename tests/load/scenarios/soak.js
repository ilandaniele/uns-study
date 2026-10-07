import { Rate, Trend } from 'k6/metrics';
import { baseThresholds, endpointThresholds, lifecycleTimeouts } from '../config/base.js';
import { standardSetup, userIteration, onResponse, getContext, setTags, endpointsFor } from '../helpers/flows.js';
import { checkoutAll } from '../helpers/auth.js';
import { summaryOutputs, metricStat } from '../helpers/checks.js';
import { elapsedMs, durationMs } from '../helpers/data.js';

// Soak: 80 VUs for 2 h. Looks for slow degradation, not peak capacity: latency drift and error creep
// per 10-minute window (soak_latency{window}, soak_errors{window}), plus check-in churn (each VU leaves and
// re-sits every ~25 min) so connection pools, caches and the expiry job see sustained write traffic.
// k6 cannot see server memory: the CI workflow samples the API process RSS alongside (see README).
const USERS = parseInt(__ENV.USERS || '80', 10);
const HOLD = __ENV.SOAK_HOLD || '2h';
const RAMP = '5m';
const WINDOW_MS = 10 * 60000;
// One window per started 10 min of the run (ramp up + hold + ramp down), so every declared
// soak_*{window:wNN} threshold gets samples: a window with no traffic would pass silently.
const WINDOWS = Math.ceil((2 * durationMs(RAMP) + durationMs(HOLD)) / WINDOW_MS);
const DRIFT_LIMIT = 1.5; // last steady window p95 / first steady window p95

const latency = new Trend('soak_latency', true);
const errors = new Rate('soak_errors');

function windowName(i) {
  return 'w' + (i < 10 ? '0' : '') + i;
}

const windowThresholds = {};
for (let i = 0; i < WINDOWS; i++) {
  windowThresholds[`soak_latency{window:${windowName(i)}}`] = ['p(95)<500'];
  windowThresholds[`soak_errors{window:${windowName(i)}}`] = ['rate<0.01'];
}

const profile = {
  checkinOnOpen: false,
  pCheckin: 0.5,
  pBrowse: 0.3,
  pObserve: 0.03,
  pExtend: 0.02,
  churnMs: 25 * 60000,
  thinkMin: 20,
  thinkMax: 40,
};

export const options = {
  stages: [
    { duration: RAMP, target: USERS },
    { duration: HOLD, target: USERS },
    { duration: RAMP, target: 0 },
  ],
  ...lifecycleTimeouts(USERS),
  thresholds: {
    ...baseThresholds(),
    ...endpointThresholds({ only: endpointsFor(profile), maxErrors: 50 }),
    ...windowThresholds,
    map_304_ratio: ['rate>0.5'],
    rate_limited_count: ['count<20'],
    server_error_count: ['count==0'],
    auth_failure_count: ['count<10', { threshold: 'count<50', abortOnFail: true }],
    endpoint_errors: ['count<200'],
    checkin_ok: [`count>=${Math.floor(USERS * 0.5)}`],
  },
  tags: { test_type: 'soak' },
};

// soak_errors = anything verify() did not accept (5xx, network errors, 401/403, 429, unexpected 4xx);
// expected business conflicts (SEAT_TAKEN, NO_ACTIVE_CHECKIN, ...) are not errors.
onResponse((endpoint, res, c, outcome) => {
  const window = c.tags.window || 'w00';
  latency.add(res.timings.duration, { window });
  errors.add(outcome === 'error' || outcome === 'rate_limited', { window });
});

export function setup() {
  return standardSetup(USERS);
}

export default function (data) {
  getContext(data);
  setTags({ window: windowName(Math.min(WINDOWS - 1, Math.floor(elapsedMs() / WINDOW_MS))) });
  userIteration(data, profile);
}

export function teardown(data) {
  checkoutAll(data.users);
}

export function handleSummary(data) {
  const rows = [];
  for (let i = 0; i < WINDOWS; i++) {
    const p95 = metricStat(data, `soak_latency{window:${windowName(i)}}`, 'p(95)');
    if (p95 === null) continue;
    const passes = metricStat(data, `soak_errors{window:${windowName(i)}}`, 'passes') || 0;
    const fails = metricStat(data, `soak_errors{window:${windowName(i)}}`, 'fails') || 0;
    if (passes + fails === 0) continue; // declared but never sampled
    rows.push({ window: windowName(i), p95_ms: p95, error_rate: metricStat(data, `soak_errors{window:${windowName(i)}}`, 'rate') });
  }
  // w00 includes the 5 min ramp and the last window the ramp-down: compare steady-state windows only.
  const steady = rows.slice(1, rows.length - 1);
  let drift = null;
  let verdict = 'not enough windows to measure drift (need a run of at least ~40 min)';
  if (steady.length >= 2 && steady[0].p95_ms > 0) {
    drift = steady[steady.length - 1].p95_ms / steady[0].p95_ms;
    verdict = drift > DRIFT_LIMIT ? `LATENCY DRIFT: p95 grew x${drift.toFixed(2)} (limit x${DRIFT_LIMIT})` : `no significant latency drift (x${drift.toFixed(2)})`;
  }
  const out = summaryOutputs('soak', data, { 'soak-drift.json': { verdict, drift, limit: DRIFT_LIMIT, windows: rows } });
  out.stdout += `\n  ${verdict}\n` + rows.map((r) => `  ${r.window}: p95 ${r.p95_ms.toFixed(0)}ms  errors ${(r.error_rate * 100).toFixed(2)}%`).join('\n') + '\n';
  return out;
}
