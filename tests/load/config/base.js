import { environments, TARGET_ENV } from './environments.js';

const target = environments[TARGET_ENV];
if (!target) {
  throw new Error(`Unknown TARGET_ENV "${TARGET_ENV}" (expected one of: ${Object.keys(environments).join(', ')})`);
}

export const BASE_URL = (__ENV.BASE_URL || target.baseUrl).replace(/\/+$/, '');
// Sent as `Origin` on every state-changing request (csrf.middleware.ts rejects origins not in WEB_ORIGIN).
export const ORIGIN = __ENV.ORIGIN || target.origin || 'http://localhost:3000';
export const API = `${BASE_URL}/api/v1`;
export const AUTH_API = `${BASE_URL}/api/auth`;
export const RESULTS_DIR = (__ENV.RESULTS_DIR || 'tests/load/results').replace(/\/+$/, '');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// Never targetable, not even with ALLOW_REMOTE=1.
const PRODUCTION_HOSTS = [/(^|\.)saladeestudio\.com\.ar$/i, /(^|\.)fly\.dev$/i];

/**
 * Host of an http(s) URL, or null when it cannot be determined safely. Userinfo (`user@host`), backslashes and
 * percent-escapes in the authority are rejected outright: `http://localhost:x@prod.example` would otherwise read
 * as "localhost" here while the request actually goes to prod.example. Trailing dots (FQDN form) are stripped so
 * `saladeestudio.com.ar.` cannot slip past the production list.
 */
export function hostOf(url) {
  const m = /^https?:\/\/([^/?#]*)/i.exec(String(url || ''));
  if (!m) return null;
  const authority = m[1];
  if (!authority || /[@\%\s]/.test(authority)) return null;
  const hm = /^(\[[0-9a-f:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/i.exec(authority);
  if (!hm) return null;
  return hm[1].toLowerCase().replace(/\.+$/, '');
}

/** Throws unless `url` is a local stack (or ALLOW_REMOTE=1 for a private, non-production host). */
export function assertSafeUrl(url) {
  const host = hostOf(url);
  if (!host) throw new Error(`URL "${url}" is not a plain http(s) URL (userinfo/escapes are not allowed)`);
  if (PRODUCTION_HOSTS.some((re) => re.test(host))) {
    throw new Error(`Refusing to load-test production host "${host}". These scripts only target local/private stacks.`);
  }
  if (!LOCAL_HOSTS.includes(host) && __ENV.ALLOW_REMOTE !== '1') {
    throw new Error(`Refusing to run against non-local host "${host}". Set ALLOW_REMOTE=1 if this is a private test stack.`);
  }
}

export function assertSafeTarget() {
  assertSafeUrl(BASE_URL);
}

// Fail at init (before any VU starts) if the target is not allowed.
assertSafeTarget();

/**
 * Global budgets. Every request made by VU code is tagged `phase:main`; setup() sign-ups/discovery are tagged
 * `phase:setup` and teardown checkouts `phase:teardown` (see helpers/auth.js, helpers/flows.js). k6 has no way to
 * keep setup out of the built-in `http_req_duration`, so the thresholds sit on the `{phase:main}` sub-metrics.
 * `http_reqs{phase:main} count>0` makes a run that produced no traffic fail instead of passing vacuously, and
 * the abort guard stops a run whose requests mostly fail (wrong cookies/origin, API down) after 1 minute.
 * stress/spike pass relaxed budgets (documented in the README).
 */
export function baseThresholds({ failed = 'rate<0.01', duration = ['p(95)<500', 'p(99)<1000'], checks = 'rate>0.99', abortFailRate = 'rate<0.5' } = {}) {
  return {
    'http_reqs{phase:main}': ['count>0'],
    'http_req_failed{phase:main}': [failed, { threshold: abortFailRate, abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_duration{phase:main}': duration,
    checks: [checks],
  };
}

// Per-endpoint latency budgets in ms (p95, p99). Cheap cached reads are held to tighter budgets
// than the DB-transaction writes.
export const endpointBudgets = {
  health: [100, 300],
  auth_providers: [200, 500],
  rooms_list: [300, 800],
  room: [300, 800],
  map: [300, 800],
  announcements: [300, 800],
  me: [400, 900],
  people: [500, 1000],
  occupants: [500, 1000],
  messages: [500, 1000],
  rankings: [500, 1000],
  disputes: [500, 1000],
  realtime_token: [300, 800],
  profile: [500, 1000],
  notif_prefs: [500, 1000],
  conversations: [500, 1000],
  subscription: [500, 1000],
  presence_validate: [400, 900],
  checkin: [800, 1500],
  checkout: [800, 1500],
  extend: [800, 1500],
  observation: [800, 1500],
};

/**
 * Per-endpoint thresholds: latency (`http_req_duration{endpoint:x}`) and error count
 * (`endpoint_errors{endpoint:x}`). `only` MUST list the endpoints the scenario actually calls
 * (flows.js `endpointsFor`): a threshold on a sub-metric that never gets a sample passes silently.
 * Setup/teardown requests use their own endpoint names (setup_*, teardown), so they never land here.
 * `scale` loosens latency (stress/spike/peak), `maxErrors` caps errors.
 */
export function endpointThresholds({ only, scale = 1, maxErrors = 5 } = {}) {
  const out = {};
  const names = only || Object.keys(endpointBudgets);
  for (const name of names) {
    if (!endpointBudgets[name]) throw new Error(`No latency budget for endpoint "${name}"`);
    const [p95, p99] = endpointBudgets[name];
    out[`http_req_duration{endpoint:${name}}`] = [`p(95)<${Math.round(p95 * scale)}`, `p(99)<${Math.round(p99 * scale)}`];
    out[`endpoint_errors{endpoint:${name}}`] = [`count<${maxErrors}`];
  }
  return out;
}

/** Shared timeouts: setup() creates up to MAX_VUS accounts one by one (scrypt hashing), far beyond k6's 60 s default. */
export function lifecycleTimeouts(users) {
  const setupS = Math.max(120, Math.ceil(users * 1.5) + 60);
  return { setupTimeout: `${setupS}s`, teardownTimeout: '5m' };
}
