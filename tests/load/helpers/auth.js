import http from 'k6/http';
import { randomBytes } from 'k6/crypto';
import { AUTH_API, API, BASE_URL, ORIGIN, assertSafeTarget } from '../config/base.js';
import { clientIp, SPOOF_CLIENT_IP } from './data.js';

function randomHex(bytes) {
  const view = new Uint8Array(randomBytes(bytes));
  let out = '';
  for (let i = 0; i < view.length; i++) out += (view[i] < 16 ? '0' : '') + view[i].toString(16);
  return out;
}

/** Headers for an API call. Writes carry Origin (csrf.middleware.ts) and a JSON body type. */
export function requestHeaders(ip, { write = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (SPOOF_CLIENT_IP && ip) headers['CF-Connecting-IP'] = ip;
  if (write) {
    headers.Origin = ORIGIN;
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function cookiesOf(res) {
  const cookies = [];
  for (const name of Object.keys(res.cookies || {})) {
    const list = res.cookies[name];
    if (list && list.length) cookies.push({ name, value: list[list.length - 1].value });
  }
  return cookies;
}

function hasSession(cookies) {
  return cookies.some((c) => c.name.indexOf('session_token') !== -1);
}

/**
 * Better Auth email+password: POST /api/auth/sign-up/email {email,password,name} (same call as
 * apps/web/e2e/helpers.ts:17-26); sign-up auto-signs-in and sets the session cookie. Falls back to
 * POST /api/auth/sign-in/email if the sign-up response carried no session cookie.
 */
function signUpOne(n, runId, ip) {
  const email = `loadtest+${runId}.${n}@example.test`;
  const password = randomHex(16); // generated per run; only lives in the returned setup data
  const params = {
    headers: requestHeaders(ip, { write: true }),
    // phase:setup keeps sign-ups (slow by design: scrypt) out of the {phase:main} thresholds.
    tags: { endpoint: 'setup_auth', phase: 'setup' },
    responseCallback: http.expectedStatuses({ min: 200, max: 399 }),
    // Fresh jar per account: otherwise the setup VU's jar would send user n-1's session along with user n's sign-up.
    jar: new http.CookieJar(),
  };

  let res = http.post(`${AUTH_API}/sign-up/email`, JSON.stringify({ email, password, name: `Load Test ${n}` }), params);
  if (res.status !== 200) return { error: `sign-up ${res.status}: ${String(res.body).slice(0, 120)}` };
  let cookies = cookiesOf(res);
  if (!hasSession(cookies)) {
    res = http.post(`${AUTH_API}/sign-in/email`, JSON.stringify({ email, password }), params);
    if (res.status !== 200) return { error: `sign-in ${res.status}: ${String(res.body).slice(0, 120)}` };
    cookies = cookiesOf(res);
  }
  if (!hasSession(cookies)) return { error: 'no session cookie returned' };
  return { user: { index: n, email, ip, cookies } };
}

/**
 * Call from setup(). Creates `count` users sequentially and returns them with their session cookies.
 * Accounts are < 24 h old, so the API applies its stricter "new account" observation limits
 * (abuse-policy.service.ts:16-17); the pacing in flows.js is built around those.
 */
export function signUpUsers(count) {
  assertSafeTarget();
  const runId = randomHex(4);
  const users = [];
  const failures = [];
  for (let n = 0; n < count; n++) {
    const r = signUpOne(n, runId, clientIp(n));
    if (r.user) users.push(r.user);
    else failures.push(r.error);
  }
  if (users.length < count * 0.9) {
    throw new Error(`Could not create enough test users (${users.length}/${count}). First errors: ${failures.slice(0, 3).join(' | ')}`);
  }
  if (failures.length) console.warn(`${failures.length} sign-ups failed; continuing with ${users.length} users`);
  return users;
}

let activated = false;
/** Seeds this VU's cookie jar with the user's session (once). The jar then follows Set-Cookie refreshes like a browser. */
export function activateSession(user) {
  if (activated || !user) return;
  const jar = http.cookieJar();
  for (const c of user.cookies) jar.set(BASE_URL, c.name, c.value, { path: '/' });
  activated = true;
}

/** Best-effort checkout for every test user (call from teardown) so a run does not leave active check-ins behind. */
export function checkoutAll(users) {
  const expected = http.expectedStatuses({ min: 200, max: 399 }, 404);
  for (let i = 0; i < users.length; i += 20) {
    const requests = users.slice(i, i + 20).map((u) => {
      // `cookies` with replace:true (not a raw Cookie header): a raw header would be merged with whatever the
      // teardown VU's jar holds, and two session_token cookies make the session ambiguous.
      const cookies = {};
      for (const c of u.cookies) cookies[c.name] = { value: c.value, replace: true };
      return [
        'DELETE',
        `${API}/checkins/current`,
        null,
        {
          headers: requestHeaders(u.ip, { write: true }),
          cookies,
          tags: { endpoint: 'teardown', phase: 'teardown' },
          responseCallback: expected,
        },
      ];
    });
    http.batch(requests);
  }
}
