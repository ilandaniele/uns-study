import exec from 'k6/execution';

// Room identity + geofence centre. Defaults are the seeded room (packages/database/src/seed.ts:15-25:
// slug "principal", lat -38.70138372483678, lng -62.270139753196005, geofenceRadiusM 50). Admins can
// recalibrate the geofence in a live DB, so all three are overridable.
export const ROOM_SLUG = __ENV.ROOM_SLUG || 'principal';
export const ROOM_LAT = parseFloat(__ENV.ROOM_LAT || '-38.70138372483678');
export const ROOM_LNG = parseFloat(__ENV.ROOM_LNG || '-62.270139753196005');

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** A fresh, in-geofence GPS fix (~3 m jitter, 5-25 m accuracy, captured 1.5 s ago). Presence rules: presence.service.ts. */
export function location() {
  const now = Date.now();
  return {
    latitude: ROOM_LAT + rand(-0.00003, 0.00003),
    longitude: ROOM_LNG + rand(-0.00003, 0.00003),
    accuracy: Math.round(rand(5, 25)),
    capturedAt: new Date(now - 1500).toISOString(),
    sentAt: new Date(now).toISOString(),
  };
}

/**
 * Synthetic client IP per VU. The API caps every IP at 300 req/min over /api/v1
 * (apps/api/src/common/global-ip-rate-limit.middleware.ts:7); real students each have their own IP,
 * but k6 sends everything from one. With TRUST_PROXY_HOPS=1 and no PROXY_SHARED_SECRET (local default)
 * the API trusts X-Forwarded-For, so each VU gets its own bucket. Disable with SPOOF_CLIENT_IP=0.
 */
export function clientIp(index) {
  const n = index + 1;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}
export const SPOOF_CLIENT_IP = __ENV.SPOOF_CLIENT_IP !== '0';

/** Milliseconds since the test run started. */
export function elapsedMs() {
  return exec.instance.currentTestRunDuration;
}

/** stages: [{ name, ms }] consecutive; returns the name of the stage containing `ms` (last one if past the end). */
export function stageAt(stages, ms) {
  let t = 0;
  for (let i = 0; i < stages.length; i++) {
    t += stages[i].ms;
    if (ms < t) return stages[i].name;
  }
  return stages[stages.length - 1].name;
}

/** k6-style duration string ("2h", "1h30m", "90s", "500ms") to milliseconds; throws on anything else. */
export function durationMs(text) {
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  const units = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  let total = 0;
  let consumed = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    total += parseFloat(m[1]) * units[m[2]];
    consumed += m[0].length;
  }
  if (!text || consumed !== text.length) throw new Error(`Invalid duration "${text}"`);
  return total;
}
