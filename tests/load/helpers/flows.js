import http from 'k6/http';
import { sleep } from 'k6';
import { API, assertSafeTarget } from '../config/base.js';
import { activateSession, requestHeaders, signUpUsers } from './auth.js';
import {
  ROOM_SLUG,
  clientIp,
  location,
  pick,
  rand,
} from './data.js';
import {
  checkinLatency,
  checkinOk,
  checkinSeatTaken,
  checkoutLatency,
  endpointErrors,
  expectedStatusesFor,
  extendLatency,
  map304Ratio,
  mapPayloadBytes,
  observationLatency,
  presenceLatency,
  verify,
} from './checks.js';

// Shared user behaviour used by every scenario. Module state is per VU (each k6 VU has its own runtime).
//
// Rate limits this pacing stays under (all per user unless noted):
//   POST /presence/validate        10/min   presence.controller.ts:64   -> at most one per check-in batch
//   POST /checkins                  5/min   checkins.controller.ts:133  -> <= 3 attempts per batch, batches >= 70 s apart
//   POST /checkins/current/extend   5/min   checkins.controller.ts:190  -> >= 20 s apart
//   POST /observations        20/min (any account age)         abuse-policy.service.ts:16-17, observations.controller.ts:45
//                             + 8 (new) / 15 distinct seats per 10 min  observations.service.ts:16,103-113
//                                                                       -> >= 25 s apart, <= 7 per 10 min
//   everything under /api/v1        300/min per IP   http/middleware/global-ip-rate-limit.ts -> per-VU spoofed IP (data.js)

const OBSERVATION_MIN_GAP_MS = 25_000;
const OBSERVATION_MAX_PER_10MIN = 7;
const CHECKIN_BATCH_GAP_MS = 70_000;
const CHECKIN_MAX_ATTEMPTS = 3;
const EXTEND_MIN_GAP_MS = 20_000;

const SEAT_CONFLICTS = { 409: ['SEAT_TAKEN'] };
const OBSERVATION_CONFLICTS = { 409: ['OWN_SEAT_OBSERVATION', 'SEAT_VERIFIED'] };
const NO_CHECKIN = { 404: ['NO_ACTIVE_CHECKIN'] };

let ctx = null;
let hook = null;

/**
 * Scenarios register a function (endpoint, res, ctx, outcome) called after every VU response, to record
 * scenario-specific metrics. `outcome` is verify()'s classification: 'ok' | 'conflict' | 'rate_limited' | 'error'.
 */
export function onResponse(fn) {
  hook = fn;
}

/**
 * Tags merged into every request of this VU (e.g. { spike_phase: 'spike' }); scenarios update it each iteration.
 * `phase` is reserved (setup | main | teardown, see config/base.js baseThresholds) and cannot be overridden here.
 */
export function setTags(tags) {
  if (ctx) ctx.tags = tags;
}

/**
 * setup(): guard, health check, room discovery and test users.
 * Health is mounted under the global prefix (apps/api/src/http/health.router.ts).
 */
export function standardSetup(userCount) {
  assertSafeTarget();
  // setup_* endpoint names + phase:setup: discovery requests never feed the main or per-endpoint thresholds.
  const health = http.get(`${API}/health`, { tags: { endpoint: 'setup_health', phase: 'setup' } });
  if (health.status !== 200) throw new Error(`API not reachable at ${API}/health (status ${health.status})`);

  const mapRes = http.get(`${API}/rooms/${ROOM_SLUG}/map`, { tags: { endpoint: 'setup_map', phase: 'setup' } });
  if (mapRes.status !== 200) throw new Error(`Room "${ROOM_SLUG}" not found (map status ${mapRes.status}); set ROOM_SLUG or seed the DB`);
  const map = mapRes.json();
  if (!map.seats || map.seats.length === 0) throw new Error(`Room "${ROOM_SLUG}" has no seats`);

  const users = userCount > 0 ? signUpUsers(userCount) : [];
  return {
    users,
    room: { id: map.room.id, seats: map.seats.map((s) => ({ id: s.id, code: s.code, status: s.status })) },
  };
}

function context(data) {
  if (ctx) return ctx;
  const idx = __VU - 1;
  const user = data.users[idx] || null; // more VUs than users -> anonymous visitors (read-only)
  if (user) activateSession(user);
  ctx = {
    idx,
    user,
    ip: user ? user.ip : clientIp(idx),
    roomId: data.room.id,
    seats: data.room.seats,
    etag: null,
    tags: {},
    opened: false,
    startedAt: Date.now(),
    checkedIn: false,
    seatId: null,
    checkedInAt: 0,
    lastCheckinBatchAt: 0,
    lastExtendAt: 0,
    observationLog: [],
  };
  return ctx;
}

export function getContext(data) {
  return context(data);
}

// ---- request plumbing ------------------------------------------------------------------------

function spec(c, method, path, endpoint, opts = {}) {
  const write = method !== 'GET';
  const headers = requestHeaders(c.ip, { write });
  if (opts.etag) headers['If-None-Match'] = opts.etag;
  const params = { headers, tags: Object.assign({ endpoint }, c.tags, { phase: 'main' }) };
  if (write) params.responseCallback = expectedStatusesFor(opts.conflicts);
  return { method, url: `${API}${path}`, body: opts.body ? JSON.stringify(opts.body) : null, params, endpoint, opts };
}

function send(c, s) {
  return afterResponse(c, s, http.request(s.method, s.url, s.body, s.params));
}

function sendBatch(c, specs) {
  const responses = http.batch(specs.map((s) => [s.method, s.url, s.body, s.params]));
  return specs.map((s, i) => afterResponse(c, s, responses[i]));
}

function afterResponse(c, s, res) {
  const outcome = verify(res, s.endpoint, { ok: s.opts.ok || [200], conflicts: s.opts.conflicts });
  if (s.endpoint === 'map') {
    if (s.opts.etag) map304Ratio.add(res.status === 304);
    if (res.status === 200) {
      mapPayloadBytes.add(res.body ? res.body.length : 0);
      const etag = res.headers.Etag || res.headers.ETag || res.headers.etag;
      if (etag) c.etag = etag;
      try {
        const map = res.json();
        c.seats = map.seats.map((seat) => ({ id: seat.id, code: seat.code, status: seat.status }));
      } catch (e) {
        endpointErrors.add(1, { endpoint: 'map', status: 'bad_json' });
      }
    }
  }
  if (hook) hook(s.endpoint, res, c, outcome);
  return { res, outcome };
}

// 304 is a valid answer to a conditional map request; verify() only accepts it when the caller says so.
function mapSpec(c, conditional) {
  const etag = conditional ? c.etag : null;
  return spec(c, 'GET', `/rooms/${ROOM_SLUG}/map`, 'map', { etag, ok: etag ? [200, 304] : [200] });
}

// ---- flows -----------------------------------------------------------------------------------

/**
 * What the app fires in parallel when it opens: session, room, map, announcements, people, socket token.
 * people/occupants/realtime token sit behind AuthGuard (study/room-people.controller.ts, realtime-token.controller.ts),
 * so anonymous visitors only fire the public reads; sending them would be a guaranteed 401 counted as an error.
 */
export function openApp(c) {
  const specs = [
    spec(c, 'GET', '/me', 'me'),
    spec(c, 'GET', `/rooms/${ROOM_SLUG}`, 'room'),
    mapSpec(c, false),
    spec(c, 'GET', `/rooms/${ROOM_SLUG}/announcements`, 'announcements'),
  ];
  if (c.user) {
    specs.push(spec(c, 'GET', `/rooms/${ROOM_SLUG}/people`, 'people'));
    specs.push(spec(c, 'GET', '/realtime/token', 'realtime_token'));
  }
  const results = sendBatch(c, specs);

  if (c.user && results[0].outcome === 'ok') {
    try {
      const me = results[0].res.json();
      if (me.activeCheckIn) {
        c.checkedIn = true;
        c.seatId = me.activeCheckIn.seatId;
        c.checkedInAt = Date.now();
      }
    } catch (e) {
      // verify() already counted the status; an unparsable /me body is not fatal for the flow.
    }
  }
  c.opened = true;
}

/** Map revalidation: If-None-Match with the last ETag, so an unchanged map is a cheap 304 (rooms.controller.ts:20-36). */
export function pollMap(c) {
  return send(c, mapSpec(c, true));
}

/** One random secondary screen a user might visit (read-only). `anonymous` = OptionalAuthGuard / public routes only. */
export function browse(c) {
  const slug = ROOM_SLUG;
  const anonymous = [
    () => spec(c, 'GET', `/rooms/${slug}/rankings?period=today&category=study_time`, 'rankings'),
    () => spec(c, 'GET', `/rooms/${slug}/rankings?period=week&category=streak`, 'rankings'),
    () => spec(c, 'GET', `/rooms/${slug}/disputes`, 'disputes'),
    () => spec(c, 'GET', `/rooms/${slug}/announcements`, 'announcements'),
    () => spec(c, 'GET', '/rooms', 'rooms_list'),
    () => spec(c, 'GET', `/rooms/${slug}`, 'room'),
    () => spec(c, 'GET', '/auth-providers', 'auth_providers'),
  ];
  const authed = [
    () => spec(c, 'GET', `/rooms/${slug}/messages`, 'messages'),
    () => spec(c, 'GET', `/rooms/${slug}/people`, 'people'),
    () => spec(c, 'GET', `/rooms/${slug}/occupants`, 'occupants'),
    () => spec(c, 'GET', '/conversations', 'conversations'),
    () => spec(c, 'GET', '/profiles/me', 'profile'),
    () => spec(c, 'GET', '/notifications/preferences', 'notif_prefs'),
    () => spec(c, 'GET', '/subscriptions/me', 'subscription'),
    () => spec(c, 'GET', '/me', 'me'),
  ];
  return send(c, pick(c.user ? anonymous.concat(authed, authed) : anonymous)());
}

function pickFreeSeat(c, tried) {
  const open = c.seats.filter((s) => s.status !== 'OCCUPIED' && s.id !== c.seatId && tried.indexOf(s.id) === -1);
  const pool = open.length ? open : c.seats.filter((s) => tried.indexOf(s.id) === -1);
  return pool.length ? pick(pool) : null;
}

/**
 * "Estoy acá": presence check, then up to CHECKIN_MAX_ATTEMPTS check-ins on free seats (re-reading the
 * map after a SEAT_TAKEN, as a user would). Returns 'seated' | 'full' | 'skipped' | 'failed'.
 */
export function tryCheckIn(c) {
  if (!c.user) return 'skipped';
  const now = Date.now();
  if (now - c.lastCheckinBatchAt < CHECKIN_BATCH_GAP_MS) return 'skipped';
  c.lastCheckinBatchAt = now;

  const loc = location();
  const presence = send(c, spec(c, 'POST', '/presence/validate', 'presence_validate', {
    body: {
      roomId: c.roomId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      capturedAt: loc.capturedAt,
      sentAt: loc.sentAt,
    },
    ok: [200, 201],
  }));
  presenceLatency.add(presence.res.timings.duration);
  if (presence.outcome !== 'ok') return 'failed';
  let valid = false;
  try {
    valid = presence.res.json().valid === true;
  } catch (e) {
    valid = false;
  }
  if (!valid) {
    // Seeded geofence mismatch (ROOM_LAT/ROOM_LNG) or stale clock: surface it, do not hide it.
    endpointErrors.add(1, { endpoint: 'presence_validate', status: 'invalid_presence' });
    return 'failed';
  }

  const tried = [];
  for (let attempt = 0; attempt < CHECKIN_MAX_ATTEMPTS; attempt++) {
    const seat = pickFreeSeat(c, tried);
    if (!seat) return 'full';
    tried.push(seat.id);
    const r = send(c, spec(c, 'POST', '/checkins', 'checkin', {
      body: { roomId: c.roomId, seatId: seat.id, location: location(), showIdentity: false, durationMinutes: 180 },
      ok: [200, 201],
      conflicts: SEAT_CONFLICTS,
    }));
    checkinLatency.add(r.res.timings.duration);
    if (r.outcome === 'ok') {
      c.checkedIn = true;
      c.seatId = seat.id;
      c.checkedInAt = Date.now();
      checkinOk.add(1);
      return 'seated';
    }
    if (r.outcome !== 'conflict') return 'failed';
    checkinSeatTaken.add(1);
    sleep(rand(0.5, 1.5)); // the user sees "ocupado", looks at the map again, taps another seat
    send(c, mapSpec(c, false));
  }
  return 'full';
}

/** "Sigo acá": extend the current check-in. */
export function extendCheckIn(c) {
  if (!c.user || !c.checkedIn) return 'skipped';
  const now = Date.now();
  if (now - c.lastExtendAt < EXTEND_MIN_GAP_MS) return 'skipped';
  c.lastExtendAt = now;
  const r = send(c, spec(c, 'POST', '/checkins/current/extend', 'extend', {
    body: { location: location(), durationMinutes: 180 },
    ok: [200, 201],
    conflicts: NO_CHECKIN,
  }));
  extendLatency.add(r.res.timings.duration);
  if (r.outcome === 'conflict') c.checkedIn = false;
  return r.outcome;
}

/** "Me voy". */
export function checkOut(c) {
  if (!c.user || !c.checkedIn) return 'skipped';
  const r = send(c, spec(c, 'DELETE', '/checkins/current', 'checkout', { ok: [200], conflicts: NO_CHECKIN }));
  checkoutLatency.add(r.res.timings.duration);
  c.checkedIn = false;
  c.seatId = null;
  return r.outcome;
}

/** "Está libre" / "Está ocupado" on someone else's seat, paced under the new-account limits. */
export function tryObserve(c) {
  if (!c.user) return 'skipped';
  const now = Date.now();
  c.observationLog = c.observationLog.filter((t) => now - t < 10 * 60_000);
  const last = c.observationLog.length ? c.observationLog[c.observationLog.length - 1] : 0;
  if (now - last < OBSERVATION_MIN_GAP_MS || c.observationLog.length >= OBSERVATION_MAX_PER_10MIN) return 'skipped';

  const seat = pickFreeSeat(c, []);
  if (!seat) return 'skipped';
  c.observationLog.push(now);
  const r = send(c, spec(c, 'POST', '/observations', 'observation', {
    body: { roomId: c.roomId, seatId: seat.id, status: Math.random() < 0.5 ? 'FREE' : 'OCCUPIED', location: location() },
    ok: [200, 201],
    conflicts: OBSERVATION_CONFLICTS,
  }));
  observationLatency.add(r.res.timings.duration);
  return r.outcome;
}

/**
 * One "poll cycle" of a user. profile: { pCheckin, pBrowse, pObserve, pExtend, churnMs, thinkMin, thinkMax,
 * checkinOnOpen, openDelayMin, openDelayMax }. Probabilities are per iteration.
 */
export function userIteration(data, profile) {
  const c = context(data);

  if (!c.opened) {
    openApp(c);
    if (profile.checkinOnOpen && c.user && !c.checkedIn) {
      sleep(rand(profile.openDelayMin || 2, profile.openDelayMax || 8)); // walk to a seat / pick one
      tryCheckIn(c);
    }
  } else {
    pollMap(c);
  }

  if (!c.checkedIn && Math.random() < (profile.pCheckin || 0)) tryCheckIn(c);
  if (Math.random() < (profile.pBrowse || 0)) browse(c);
  if (Math.random() < (profile.pObserve || 0)) tryObserve(c);
  if (c.checkedIn && Math.random() < (profile.pExtend || 0)) extendCheckIn(c);
  if (c.checkedIn && profile.churnMs && Date.now() - c.checkedInAt > profile.churnMs) checkOut(c);

  sleep(rand(profile.thinkMin, profile.thinkMax));
}

/** Every verified read route once, in sequence (smoke): fails loudly if any route regressed. */
export function sweepReads(c) {
  const slug = ROOM_SLUG;
  const read = (path, endpoint) => send(c, spec(c, 'GET', path, endpoint));
  read('/health', 'health');
  read('/auth-providers', 'auth_providers');
  read('/rooms', 'rooms_list');
  read(`/rooms/${slug}`, 'room');
  send(c, mapSpec(c, false));
  send(c, mapSpec(c, true)); // conditional: expect 304 on an idle room
  read(`/rooms/${slug}/announcements`, 'announcements');
  read(`/rooms/${slug}/rankings?period=today&category=study_time`, 'rankings');
  read(`/rooms/${slug}/disputes`, 'disputes');
  read('/me', 'me');
  if (!c.user) return;
  read('/realtime/token', 'realtime_token');
  read(`/rooms/${slug}/people`, 'people');
  read(`/rooms/${slug}/occupants`, 'occupants');
  read(`/rooms/${slug}/messages`, 'messages');
  read('/profiles/me', 'profile');
  read('/notifications/preferences', 'notif_prefs');
  read('/conversations', 'conversations');
  read('/subscriptions/me', 'subscription');
}

// Endpoint tags userIteration() can emit, so scenarios declare per-endpoint thresholds only for endpoints that
// actually receive traffic (a threshold on a sub-metric without samples passes silently).
const ITERATION_READS = [
  'me', 'room', 'map', 'announcements', 'people', 'occupants', 'realtime_token', 'rankings', 'disputes',
  'rooms_list', 'auth_providers', 'messages', 'conversations', 'profile', 'notif_prefs', 'subscription',
];

/** Endpoints a userIteration() profile can hit: reads + presence/check-in/observation, extend/checkout only if enabled. */
export function endpointsFor(profile) {
  const out = ITERATION_READS.slice();
  if ((profile.pCheckin || 0) > 0 || profile.checkinOnOpen) out.push('presence_validate', 'checkin');
  if ((profile.pObserve || 0) > 0) out.push('observation');
  if ((profile.pExtend || 0) > 0) out.push('extend');
  if (profile.churnMs) out.push('checkout');
  return out;
}
