import exec from 'k6/execution';
import { Rate, Trend } from 'k6/metrics';
import { baseThresholds, endpointThresholds, lifecycleTimeouts } from '../config/base.js';
import { standardSetup, userIteration, onResponse, endpointsFor } from '../helpers/flows.js';
import { checkoutAll } from '../helpers/auth.js';
import { summaryOutputs, metricStat } from '../helpers/checks.js';

// Stress: 50 -> 400 VUs in plateaus (~25 min) to find the break point.
// Measures: stress_degraded{load_bucket} (share of requests that verify() rejected - 5xx, network errors,
// 401/403, 429, unexpected 4xx - or that were slower than 1 s)
// and stress_latency{load_bucket} (p95 per concurrency bucket). handleSummary reports the first bucket
// where degradation > 5% or p95 > 1 s as the break point (stress-breaking-point.json).
const MAX_VUS = parseInt(__ENV.MAX_VUS || '400', 10);
const LEVELS = [50, 100, 200, 300, 400].filter((l) => l <= MAX_VUS);
// Buckets only up to the highest concurrency the run can reach; empty buckets are skipped in the report.
const MAX_BUCKET = Math.max(50, Math.ceil(MAX_VUS / 50) * 50);
const BUCKETS = [];
for (let b = 50; b <= MAX_BUCKET; b += 50) BUCKETS.push(b);
const SLOW_MS = 1000;

const degraded = new Rate('stress_degraded');
const latency = new Trend('stress_latency', true);

const stages = [];
for (const level of LEVELS) {
  stages.push({ duration: '1m30s', target: level });
  stages.push({ duration: '3m30s', target: level });
}
stages.push({ duration: '30s', target: 0 });

const bucketThresholds = {};
for (const b of BUCKETS) {
  // Declaring a threshold is what makes k6 keep the per-bucket sub-metric for handleSummary.
  bucketThresholds[`stress_degraded{load_bucket:b${b}}`] = ['rate<=1'];
  bucketThresholds[`stress_latency{load_bucket:b${b}}`] = ['p(95)<1000000'];
}

const profile = {
  checkinOnOpen: false,
  pCheckin: 0.3,
  pBrowse: 0.4,
  pObserve: 0.08,
  pExtend: 0.01,
  churnMs: null,
  thinkMin: 10,
  thinkMax: 20,
};

export const options = {
  stages,
  ...lifecycleTimeouts(MAX_VUS),
  thresholds: {
    // Relaxed budget (documented in README): stress may degrade - that is the finding - but not silently:
    // bounded, and aborted by baseThresholds' guard if more than half of the main-phase requests fail.
    ...baseThresholds({ failed: 'rate<0.10', duration: ['p(95)<2000'], checks: 'rate>0.90' }),
    ...endpointThresholds({ only: endpointsFor(profile), scale: 4, maxErrors: 1000000 }),
    ...bucketThresholds,
    rate_limited_count: ['count<2000'],
    // A wrong session/CSRF setup shows up as 401/403 on every authed call: stop early, it is not load.
    auth_failure_count: ['count<50', { threshold: 'count<500', abortOnFail: true, delayAbortEval: '30s' }],
    endpoint_errors: ['count<100000'],
    checkin_ok: ['count>=1'],
  },
  tags: { test_type: 'stress' },
};

function bucketOf(active) {
  return 'b' + Math.min(MAX_BUCKET, Math.max(50, Math.ceil(active / 50) * 50));
}

onResponse((endpoint, res, c, outcome) => {
  const bucket = bucketOf(exec.instance.vusActive);
  const bad = outcome === 'error' || outcome === 'rate_limited' || res.timings.duration > SLOW_MS;
  degraded.add(bad, { load_bucket: bucket });
  latency.add(res.timings.duration, { load_bucket: bucket });
});

export function setup() {
  return standardSetup(MAX_VUS);
}

export default function (data) {
  userIteration(data, profile);
}

export function teardown(data) {
  checkoutAll(data.users);
}

export function handleSummary(data) {
  const table = [];
  let breakingPoint = null;
  for (const b of BUCKETS) {
    const rate = metricStat(data, `stress_degraded{load_bucket:b${b}}`, 'rate');
    const p95 = metricStat(data, `stress_latency{load_bucket:b${b}}`, 'p(95)');
    const samples =
      (metricStat(data, `stress_degraded{load_bucket:b${b}}`, 'passes') || 0) +
      (metricStat(data, `stress_degraded{load_bucket:b${b}}`, 'fails') || 0);
    if (rate === null || samples === 0) continue; // declared but never reached
    const broke = rate > 0.05 || (p95 !== null && p95 > SLOW_MS);
    table.push({ vus_up_to: b, degraded_rate: rate, p95_ms: p95, broke });
    if (broke && breakingPoint === null) breakingPoint = b;
  }
  const verdict =
    breakingPoint === null
      ? `no break point up to ${LEVELS[LEVELS.length - 1]} VUs`
      : `break point: degradation starts in the <= ${breakingPoint} VU bucket`;
  const out = summaryOutputs('stress', data, { 'stress-breaking-point.json': { verdict, breakingPoint, buckets: table } });
  out.stdout +=
    `\n  ${verdict}\n` +
    table
      .map((r) => `  <=${r.vus_up_to} VUs: degraded ${(r.degraded_rate * 100).toFixed(1)}%  p95 ${r.p95_ms === null ? 'n/a' : r.p95_ms.toFixed(0) + 'ms'}${r.broke ? '  <-- degraded' : ''}`)
      .join('\n') +
    '\n';
  return out;
}
