import type { LocationInput, SeatCalibrationInput, SeatDto, SimpleCheckInResult } from "@sala/contracts";

type Point = { x: number; y: number };
type SeatPoint = Pick<SeatDto, "id" | "x" | "y">;
const METERS_PER_DEGREE = 6_371_000 * Math.PI / 180;
const length = (p: Point) => Math.hypot(p.x, p.y);
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const longitudeDelta = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** Invalidate calibration when seats move/appear/disappear, not when their live status changes. */
export async function seatLayoutHash(seats: SeatPoint[]): Promise<string> {
  const text = JSON.stringify(seats.map(s => [s.id, s.x, s.y]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Affine, measured map-to-ground transform. SVG coordinates by themselves are never meters. */
export function buildSeatProjection(calibration: SeatCalibrationInput, seats: SeatPoint[]) {
  const references = calibration.anchors.map(anchor => {
    const seat = seats.find(s => s.id === anchor.seatId);
    if (!seat) throw new Error("Las referencias deben ser asientos activos de esta sala.");
    return { ...anchor, u: seat.x / 1000, v: seat.y / 1600 };
  });
  if (new Set(references.map(r => r.seatId)).size !== 3) throw new Error("Elegí tres asientos de referencia distintos.");
  const [a, b, c] = references as [typeof references[number], typeof references[number], typeof references[number]];
  const longitudeScale = METERS_PER_DEGREE * Math.cos(a.latitude * Math.PI / 180);
  const ground = (p: { latitude: number; longitude: number }): Point => ({ x: longitudeDelta(p.longitude, a.longitude) * longitudeScale, y: (p.latitude - a.latitude) * METERS_PER_DEGREE });
  const p = ground(b), q = ground(c);
  const bu = b.u - a.u, bv = b.v - a.v, cu = c.u - a.u, cv = c.v - a.v;
  const determinant = bu * cv - cu * bv;
  if (Math.abs(determinant) < 0.0001) throw new Error("Las tres referencias no pueden estar alineadas en el plano.");
  const horizontal = { x: (p.x * cv - q.x * bv) / determinant, y: (p.y * cv - q.y * bv) / determinant };
  const vertical = { x: (q.x * bu - p.x * cu) / determinant, y: (q.y * bu - p.y * cu) / determinant };
  const widthM = length(horizontal), depthM = length(vertical);
  if (!Number.isFinite(widthM + depthM) || widthM < 2 || widthM > 60 || depthM < 3 || depthM > 120 || Math.abs(cross(horizontal, vertical)) / (widthM * depthM) < 0.2) {
    throw new Error("Las referencias no forman una sala con dimensiones válidas. Revisá las mediciones.");
  }
  const point = (s: SeatPoint): Point => ({ x: horizontal.x * (s.x / 1000 - a.u) + vertical.x * (s.y / 1600 - a.v), y: horizontal.y * (s.x / 1000 - a.u) + vertical.y * (s.y / 1600 - a.v) });
  const corners = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1600 }, { x: 0, y: 1600 }].map(s => point({ ...s, id: "corner" }));
  const orientation = Math.sign(cross(horizontal, vertical));
  const contains = (p: Point, radius = 0) => corners.every((start, index) => {
    const edge = minus(corners[(index + 1) % 4]!, start);
    return orientation * cross(edge, minus(p, start)) / length(edge) >= radius;
  });
  return { ground, point, contains, widthM, depthM,
    geographic: (s: SeatPoint) => { const p = point(s); return { latitude: a.latitude + p.y / METERS_PER_DEGREE, longitude: ((a.longitude + p.x / longitudeScale + 540) % 360) - 180 }; },
  };
}

export function selectSimpleSeat(location: LocationInput, calibration: SeatCalibrationInput, seats: SeatDto[], nowMs = Date.now()): { seatId: string } | Extract<SimpleCheckInResult, { outcome: "CONFIRM" }> {
  const projection = buildSeatProjection(calibration, seats);
  const user = projection.ground(location);
  const radius = location.accuracy + calibration.uncertaintyM;
  const capturedMs = Date.parse(location.capturedAt);
  const ageMs = (location.sentAt ? Date.parse(location.sentAt) : nowMs) - capturedMs;
  const serverAgeMs = nowMs - capturedMs;
  const fresh = Number.isFinite(ageMs) && ageMs >= -1000 && ageMs <= 10_000 && serverAgeMs >= -1000 && serverAgeMs <= 10_000;
  const ranked = seats.map(seat => ({ seat, point: projection.point(seat), distance: length(minus(projection.point(seat), user)) })).sort((a, b) => a.distance - b.distance || a.seat.code.localeCompare(b.seat.code));
  const available = ranked.filter(s => s.seat.status === "FREE" && !s.seat.dispute && !s.seat.occupiedUntil);
  const nearest = available[0];
  const confirm = (reason: Extract<SimpleCheckInResult, { outcome: "CONFIRM" }>["reason"]): Extract<SimpleCheckInResult, { outcome: "CONFIRM" }> => ({ outcome: "CONFIRM", reason,
    suggestedSeatId: nearest && fresh && location.accuracy <= 5 && projection.contains(user) ? nearest.seat.id : null,
    candidateSeatIds: available.slice(0, 5).map(s => s.seat.id), accuracyM: location.accuracy,
  });
  if (!nearest) return confirm("NO_FREE_SEAT");
  if (!projection.contains(user, radius)) return confirm("OUTSIDE_CALIBRATED_AREA");
  // Never hop over a physically closer occupied/unknown chair to assign some other free one.
  if (ranked[0]?.seat.id !== nearest.seat.id) return confirm("NEAREST_UNAVAILABLE");
  if (!fresh || location.accuracy <= 0 || nearest.distance + radius > 1) return confirm("AMBIGUOUS");
  for (const other of ranked) {
    if (other.seat.id === nearest.seat.id) continue;
    const separation = length(minus(other.point, nearest.point));
    // Distance to the perpendicular bisector: the WHOLE uncertainty circle must fit in this
    // chair's Voronoi cell, including boundaries against unavailable/unknown chairs.
    if (separation < 0.001 || (other.distance ** 2 - nearest.distance ** 2) / (2 * separation) <= radius + 0.001) return confirm("AMBIGUOUS");
  }
  return { seatId: nearest.seat.id };
}
