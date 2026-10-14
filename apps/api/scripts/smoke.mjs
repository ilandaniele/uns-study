#!/usr/bin/env node
// Usage: node apps/api/scripts/smoke.mjs [baseUrl] [--signup]
// Smoke test against `wrangler dev --port 4000` (default) or a deployed URL.
// --signup also signs up two users and races a check-in on the same seat; it needs the API to run
// with PRESENCE_DEV_BYPASS=1 (wrangler dev --var PRESENCE_DEV_BYPASS:1 --var NODE_ENV:development).
const args = process.argv.slice(2);
const withSignup = args.includes("--signup");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:4000").replace(/\/$/, "");
const origin = new URL(base).origin;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const api = (path, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { origin, "content-type": "application/json", ...(init.headers ?? {}) } });

async function jsonOf(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function checkHealth() {
  const res = await api("/api/v1/health");
  check("GET /health is 200", res.status === 200, `status ${res.status}`);
  const h = res.headers;
  check(
    "security headers",
    h.get("x-content-type-options") === "nosniff" &&
      h.get("referrer-policy") === "no-referrer" &&
      (h.get("content-security-policy") ?? "").includes("default-src 'none'"),
  );
}

async function checkMap() {
  const res = await api("/api/v1/rooms/principal/map");
  const body = await jsonOf(res);
  const seats = body?.seats ?? body?.room?.seats ?? [];
  check("GET /rooms/principal/map has 108 seats", res.status === 200 && seats.length === 108, `status ${res.status}, seats ${seats.length}`);
  return seats[0]?.id;
}

async function checkAnonymous() {
  const me = await api("/api/v1/me");
  const meBody = await jsonOf(me);
  check("GET /me anonymous is 200 with user null", me.status === 200 && meBody?.user === null, `status ${me.status}`);
  const checkin = await api("/api/v1/checkins", { method: "POST", body: "{}" });
  const body = await jsonOf(checkin);
  check("POST /checkins anonymous is 401 UNAUTHENTICATED", checkin.status === 401 && body?.error?.code === "UNAUTHENTICATED", `status ${checkin.status}`);
}

async function checkWebSocket(roomId) {
  const name = "WebSocket room:join acks { joined: true }";
  const url = `${base.replace(/^http/, "ws")}/api/v1/realtime/ws`;
  await new Promise((resolve) => {
    const ws = new WebSocket(url, { headers: { origin } });
    const timer = setTimeout(() => {
      check(name, false, "timeout");
      ws.close();
      resolve();
    }, 8000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ e: "room:join", d: { roomId }, id: 1 })));
    ws.addEventListener("message", (ev) => {
      const frame = JSON.parse(String(ev.data));
      if (frame.ack !== 1) return;
      clearTimeout(timer);
      check(name, frame.d?.joined === true, JSON.stringify(frame));
      ws.close();
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      check(name, false, "socket error");
      resolve();
    });
  });
}

async function signUp(tag) {
  const email = `smoke-${tag}-${Date.now()}@example.test`;
  const res = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: "Smoke-test-pass-1!", name: `Smoke ${tag}` }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { ok: res.ok, cookie };
}

async function checkConcurrentCheckIn(roomId, seatId) {
  const [a, b] = await Promise.all([signUp("a"), signUp("b")]);
  check("sign up two users", a.ok && b.ok && Boolean(a.cookie) && Boolean(b.cookie));
  if (!a.cookie || !b.cookie) return;
  const location = { latitude: -38.7018942, longitude: -62.2702852, accuracy: 10, capturedAt: new Date().toISOString() };
  const body = JSON.stringify({ roomId, seatId, location, showIdentity: false });
  const results = await Promise.all([a, b].map((u) => api("/api/v1/checkins", { method: "POST", body, headers: { cookie: u.cookie } })));
  const statuses = results.map((r) => r.status).sort();
  check("concurrent check-in on one seat gives exactly one 201", statuses.filter((s) => s === 201).length === 1, statuses.join(","));
}

await checkHealth();
const seatId = await checkMap();
await checkAnonymous();
const roomRes = await api("/api/v1/rooms/principal");
const room = await jsonOf(roomRes);
const roomId = room?.id ?? room?.room?.id;
if (roomId) await checkWebSocket(roomId);
else check("GET /rooms/principal returns an id", false, `status ${roomRes.status}`);
if (withSignup && roomId && seatId) await checkConcurrentCheckIn(roomId, seatId);

console.log(failures === 0 ? "smoke passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
