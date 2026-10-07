import { baseThresholds, endpointThresholds, lifecycleTimeouts } from '../config/base.js';
import { standardSetup, userIteration, endpointsFor } from '../helpers/flows.js';
import { checkoutAll } from '../helpers/auth.js';
import { summaryOutputs } from '../helpers/checks.js';

// Load: ~60 concurrent users for ~10 min (normal weekday). Read-heavy: each VU revalidates the map every
// 20-30 s (If-None-Match), opens secondary screens now and then, checks in once, and observes rarely.
// Measures: map_304_ratio (cache efficiency), checkin_latency / observation_latency, per-endpoint p95,
// and rate_limited_count == ~0 (this pacing is meant to stay under every limit).
const USERS = parseInt(__ENV.USERS || '60', 10);

const profile = {
  checkinOnOpen: false,
  pCheckin: 0.3, // per iteration until seated: most users sit down within their first few minutes
  pBrowse: 0.25,
  pObserve: 0.05,
  pExtend: 0.01,
  churnMs: null,
  thinkMin: 20,
  thinkMax: 30,
};

export const options = {
  stages: [
    { duration: '2m', target: USERS },
    { duration: '6m', target: USERS },
    { duration: '2m', target: 0 },
  ],
  ...lifecycleTimeouts(USERS),
  thresholds: {
    ...baseThresholds(), // p95 < 500, p99 < 1000, failed < 1%, checks > 99% on {phase:main}
    ...endpointThresholds({ only: endpointsFor(profile), maxErrors: 10 }),
    map_304_ratio: ['rate>0.5'],
    checkin_latency: ['p(95)<800', 'p(99)<1500'],
    observation_latency: ['p(95)<800', 'p(99)<1500'],
    rate_limited_count: ['count<10'],
    server_error_count: ['count==0'],
    auth_failure_count: ['count<5', { threshold: 'count<50', abortOnFail: true }],
    endpoint_errors: ['count<30'],
    checkin_ok: [`count>=${Math.floor(USERS * 0.5)}`],
  },
  tags: { test_type: 'load' },
};

export function setup() {
  return standardSetup(USERS);
}

export default function (data) {
  userIteration(data, profile);
}

export function teardown(data) {
  checkoutAll(data.users);
}

export function handleSummary(data) {
  return summaryOutputs('load', data);
}
