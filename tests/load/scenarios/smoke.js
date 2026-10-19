import { sleep } from 'k6';
import { baseThresholds, endpointThresholds, lifecycleTimeouts } from '../config/base.js';
import { standardSetup, getContext, sweepReads, tryCheckIn, tryObserve, extendCheckIn, checkOut } from '../helpers/flows.js';
import { checkoutAll } from '../helpers/auth.js';
import { summaryOutputs } from '../helpers/checks.js';

// Smoke: 1 VU, 30 s. Goal = every verified route answers correctly once, writes included.
// Measures: per-route correctness (checks == 100%), zero 429/5xx, map ETag revalidation works (304).
// Every endpoint in endpointBudgets is exercised here (sweepReads + the write flow), so all are thresholded.
export const options = {
  vus: 1,
  duration: '30s',
  ...lifecycleTimeouts(1),
  thresholds: {
    ...baseThresholds({ failed: 'rate<0.001', checks: 'rate==1' }),
    ...endpointThresholds(),
    map_304_ratio: ['rate>0.9'],
    rate_limited_count: ['count==0'],
    server_error_count: ['count==0'],
    auth_failure_count: [{ threshold: 'count==0', abortOnFail: true }],
    endpoint_errors: ['count==0'],
    checkin_ok: ['count>=1'],
  },
  tags: { test_type: 'smoke' },
};

export function setup() {
  return standardSetup(1);
}

export default function (data) {
  const c = getContext(data);
  sweepReads(c);

  // Write flow once per ~3 iterations (check-in limit is 5/min, observations 20/min).
  if (__ITER % 3 === 0 && c.user) {
    tryCheckIn(c);
    sleep(1);
    tryObserve(c);
    sleep(1);
    extendCheckIn(c);
    sleep(1);
    checkOut(c);
  }
  sleep(2);
}

export function teardown(data) {
  checkoutAll(data.users);
}

export function handleSummary(data) {
  return summaryOutputs('smoke', data);
}
