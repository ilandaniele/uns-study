import { Rate, Trend } from 'k6/metrics';
import { baseThresholds, endpointThresholds, lifecycleTimeouts } from '../config/base.js';
import { standardSetup, userIteration, onResponse, getContext, setTags, endpointsFor } from '../helpers/flows.js';
import { checkoutAll } from '../helpers/auth.js';
import { summaryOutputs } from '../helpers/checks.js';
import { elapsedMs, stageAt } from '../helpers/data.js';

// Spike: 10 -> 500 VUs in 30 s (everyone opens the app at once, e.g. a class lets out), twice, with a
// quiet stretch between. VUs beyond USERS are anonymous visitors (the public map is readable without login).
// Measures: spike_map_latency{spike_phase} and spike_errors{spike_phase} (not `phase`: that tag is reserved
// for setup/main/teardown filtering in config/base.js); the pass/fail question is RECOVERY - after the
// spike, latency and errors must return to baseline levels (thresholds on the recovery phase).
const USERS = parseInt(__ENV.USERS || '150', 10);
const PEAK = parseInt(__ENV.PEAK_VUS || '500', 10);

const PHASES = [
  { name: 'baseline', ms: 60000 },
  { name: 'ramp_up', ms: 30000 },
  { name: 'spike', ms: 120000 },
  { name: 'ramp_down', ms: 30000 },
  { name: 'recovery', ms: 120000 },
  { name: 'ramp_up2', ms: 30000 },
  { name: 'spike2', ms: 60000 },
  { name: 'end', ms: 60000 },
];
const TARGETS = [10, PEAK, PEAK, 10, 10, PEAK, PEAK, 0];

const spikeErrors = new Rate('spike_errors');
const spikeMapLatency = new Trend('spike_map_latency', true);

const profile = {
  checkinOnOpen: false,
  pCheckin: 0.1,
  pBrowse: 0.3,
  pObserve: 0.02,
  pExtend: 0,
  churnMs: null,
  thinkMin: 5,
  thinkMax: 15,
};

export const options = {
  stages: PHASES.map((p, i) => ({ duration: `${p.ms / 1000}s`, target: TARGETS[i] })),
  ...lifecycleTimeouts(USERS),
  thresholds: {
    // Relaxed whole-run budget (documented in README); the strict verdict is the per-phase recovery below.
    ...baseThresholds({ failed: 'rate<0.15', duration: ['p(95)<3000'], checks: 'rate>0.85' }),
    ...endpointThresholds({ only: endpointsFor(profile), scale: 6, maxErrors: 1000000 }),
    'spike_errors{spike_phase:baseline}': ['rate<0.01'],
    'spike_errors{spike_phase:spike}': ['rate<0.15'],
    'spike_errors{spike_phase:recovery}': ['rate<0.01'],
    'spike_map_latency{spike_phase:baseline}': ['p(95)<500'],
    'spike_map_latency{spike_phase:spike}': ['p(95)<3000'],
    'spike_map_latency{spike_phase:recovery}': ['p(95)<600'],
    rate_limited_count: ['count<500'],
    auth_failure_count: ['count<50', { threshold: 'count<500', abortOnFail: true, delayAbortEval: '30s' }],
    endpoint_errors: ['count<100000'],
  },
  tags: { test_type: 'spike' },
};

onResponse((endpoint, res, c, outcome) => {
  const spikePhase = c.tags.spike_phase || 'baseline';
  spikeErrors.add(outcome === 'error' || outcome === 'rate_limited', { spike_phase: spikePhase });
  if (endpoint === 'map') spikeMapLatency.add(res.timings.duration, { spike_phase: spikePhase });
});

export function setup() {
  return standardSetup(USERS);
}

export default function (data) {
  getContext(data);
  setTags({ spike_phase: stageAt(PHASES, elapsedMs()) });
  userIteration(data, profile);
}

export function teardown(data) {
  checkoutAll(data.users);
}

export function handleSummary(data) {
  return summaryOutputs('spike', data);
}
