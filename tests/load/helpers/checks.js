import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
// Both remote modules are pinned to a fixed version (a moving `main` branch could change the report, or break
// it, between two runs being compared). k6 fetches them at init; a fetch failure aborts the run loudly.
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/2.4.0/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import { RESULTS_DIR } from '../config/base.js';

// ---- Error accounting (never silent) -------------------------------------------------------
// 429 is NOT a success and NOT a generic error: it is the signal that pacing exceeded a limit.
export const rateLimitedCount = new Counter('rate_limited_count');
export const endpointErrors = new Counter('endpoint_errors'); // tagged endpoint + status
export const serverErrorCount = new Counter('server_error_count'); // 5xx / network failure
export const authFailureCount = new Counter('auth_failure_count'); // 401/403 that are not a known business reply
export const businessConflicts = new Counter('business_conflicts'); // expected 409/404 business replies

// ---- Domain metrics ------------------------------------------------------------------------
export const map304Ratio = new Rate('map_304_ratio'); // revalidations (If-None-Match sent) answered 304
export const mapPayloadBytes = new Trend('map_payload_bytes', false); // full 200 bodies only
export const presenceLatency = new Trend('presence_latency', true);
export const checkinLatency = new Trend('checkin_latency', true);
export const checkoutLatency = new Trend('checkout_latency', true);
export const extendLatency = new Trend('extend_latency', true);
export const observationLatency = new Trend('observation_latency', true);
export const checkinOk = new Counter('checkin_ok');
export const checkinSeatTaken = new Counter('checkin_seat_taken');

// http_req_failed: 4xx/5xx are failures except the documented business reply of THAT write (409 on check-in /
// observation, 404 on extend / checkout). The callback only sees the status, so the error *code* is enforced
// by verify(): an unexpected 409/404 code on those routes still fails the check and counts in endpoint_errors.
// 401/403/429/5xx are never expected. Reads keep k6's default (200-399, so a 304 revalidation is not a failure).
const expectedByStatuses = {};
export function expectedStatusesFor(conflicts) {
  const extra = Object.keys(conflicts || {}).map(Number).sort();
  const key = extra.join(',');
  if (!expectedByStatuses[key]) expectedByStatuses[key] = http.expectedStatuses({ min: 200, max: 399 }, ...extra);
  return expectedByStatuses[key];
}

function errorCode(res) {
  try {
    const body = JSON.parse(res.body);
    return body && body.error ? body.error.code : null;
  } catch (e) {
    return null;
  }
}

/**
 * Classifies a response and records it. Returns 'ok' | 'conflict' | 'rate_limited' | 'error'.
 * Only 'ok' and a listed expected business conflict pass the check; 401/403/429/5xx never do.
 *
 * opts.ok: statuses that mean success (default [200])
 * opts.conflicts: { status: [allowed error.code, ...] } for expected business replies on writes
 */
export function verify(res, endpoint, opts = {}) {
  const okStatuses = opts.ok || [200];
  const conflicts = opts.conflicts || {};
  const status = res.status;
  let outcome;

  if (okStatuses.indexOf(status) !== -1) {
    outcome = 'ok';
  } else if (status === 429) {
    outcome = 'rate_limited';
    rateLimitedCount.add(1, { endpoint });
  } else if (conflicts[status] && conflicts[status].indexOf(errorCode(res)) !== -1) {
    outcome = 'conflict';
    businessConflicts.add(1, { endpoint, code: String(errorCode(res)) });
  } else {
    outcome = 'error';
    endpointErrors.add(1, { endpoint, status: String(status) });
    if (status >= 500 || status === 0) serverErrorCount.add(1, { endpoint });
    if (status === 401 || status === 403) authFailureCount.add(1, { endpoint });
  }

  check(res, { [`${endpoint}: expected status`]: () => outcome === 'ok' || outcome === 'conflict' }, { endpoint });
  return outcome;
}

// ---- Summary -------------------------------------------------------------------------------
/** handleSummary outputs: JSON + HTML report + console text; `extra` = { fileName: object|string }. */
export function summaryOutputs(name, data, extra = {}) {
  const out = {
    [`${RESULTS_DIR}/${name}-summary.json`]: JSON.stringify(data, null, 2),
    [`${RESULTS_DIR}/${name}-report.html`]: htmlReport(data),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
  for (const file of Object.keys(extra)) {
    out[`${RESULTS_DIR}/${file}`] = typeof extra[file] === 'string' ? extra[file] : JSON.stringify(extra[file], null, 2);
  }
  return out;
}

/** values[stat] of a (sub)metric in handleSummary data, or null. */
export function metricStat(data, key, stat) {
  const m = data.metrics[key];
  return m && m.values && m.values[stat] !== undefined ? m.values[stat] : null;
}
