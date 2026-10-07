import { baseThresholds, endpointThresholds, lifecycleTimeouts } from '../config/base.js';
import { standardSetup, userIteration, onResponse, getContext, endpointsFor } from '../helpers/flows.js';
import { checkoutAll } from '../helpers/auth.js';
import { summaryOutputs } from '../helpers/checks.js';
import { Rate, Trend, Counter } from 'k6/metrics';

// Peak: 300 users in 15 min modelling the 08:00 exam-season rush: everybody opens the map within
// minutes and tries to sit down at once, with ~108 seats for 300 people.
// Measures: time_to_seated (VU start -> successful check-in), seat_conflict_ratio (SEAT_TAKEN share of
// check-in attempts: expected to be high, it is the contention), checkin_latency under burst, open_app_latency
// (map latency inside the parallel open burst: /me + room + map + announcements + people + token), map_304_ratio afterwards.
const USERS = parseInt(__ENV.USERS || '300', 10);

const timeToSeated = new Trend('time_to_seated', true);
const openAppLatency = new Trend('open_app_latency', true); // map latency inside the parallel open burst
const seatConflictRatio = new Rate('seat_conflict_ratio');
const seated = new Counter('rush_seated');

const profile = {
  checkinOnOpen: true,
  openDelayMin: 2,
  openDelayMax: 10,
  pCheckin: 0.5, // latecomers retry (>= 70 s apart) once the first batch of seats is gone
  pBrowse: 0.15,
  pObserve: 0.05,
  pExtend: 0,
  churnMs: null,
  thinkMin: 15,
  thinkMax: 30,
};

export const options = {
  stages: [
    { duration: '3m', target: USERS }, // the rush: arrivals ramp up
    { duration: '9m', target: USERS },
    { duration: '3m', target: 0 },
  ],
  ...lifecycleTimeouts(USERS),
  thresholds: {
    // Global budget stays p95 < 500 on {phase:main}: the rush is the normal peak this app must absorb.
    // Per-endpoint budgets are doubled for the burst (documented in the README).
    ...baseThresholds(),
    ...endpointThresholds({ only: endpointsFor(profile), scale: 2, maxErrors: 30 }),
    map_304_ratio: ['rate>0.3'],
    checkin_latency: ['p(95)<1500', 'p(99)<3000'],
    observation_latency: ['p(95)<1500', 'p(99)<3000'],
    open_app_latency: ['p(95)<1500'],
    time_to_seated: ['p(95)<20000'],
    rush_seated: ['count>=80'], // 108 seats exist; a leftover DB state may hold a few
    rate_limited_count: ['count<20'],
    server_error_count: ['count==0'],
    auth_failure_count: ['count<5', { threshold: 'count<50', abortOnFail: true }],
    endpoint_errors: ['count<100'],
  },
  tags: { test_type: 'peak' },
};

let wasSeated = false;
onResponse((endpoint, res, c, outcome) => {
  if (endpoint === 'checkin') {
    if (outcome === 'ok') {
      seatConflictRatio.add(false);
      if (!wasSeated) {
        wasSeated = true;
        timeToSeated.add(Date.now() - c.startedAt);
        seated.add(1);
      }
    } else if (outcome === 'conflict') {
      seatConflictRatio.add(true); // SEAT_TAKEN only; any other 409 is an error, not contention
    }
  }
  if (endpoint === 'map' && !c.opened) openAppLatency.add(res.timings.duration);
});

export function setup() {
  return standardSetup(USERS);
}

export default function (data) {
  getContext(data);
  userIteration(data, profile);
}

export function teardown(data) {
  checkoutAll(data.users);
}

export function handleSummary(data) {
  return summaryOutputs('peak', data);
}
