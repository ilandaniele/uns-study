import type { Point } from "./behavior";

export const FLOOR = { left: 100, right: 990, top: 310, bottom: 1335 };
export const CHAIR_CLEARANCE = 28;

function clearSegment(from: Point, to: Point, chairs: readonly Point[]): boolean {
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  return chairs.every((chair) => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((chair.x - from.x) * dx + (chair.y - from.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(chair.x - from.x - dx * t, chair.y - from.y - dy * t) >= CHAIR_CLEARANCE;
  });
}

/** Check the whole segment, not just its endpoint, against real chair centres. */
export function canWalk(from: Point, to: Point, chairs: readonly Point[]): boolean {
  if (to.x < FLOOR.left || to.x > FLOOR.right || to.y < FLOOR.top || to.y > FLOOR.bottom) return false;
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ex = length ? dx / length * 22 : 0, ey = length ? dy / length * 22 : 0;
  return clearSegment({ x: from.x - ex, y: from.y - ey }, { x: to.x + ex, y: to.y + ey }, chairs);
}

/** Degrees clockwise from the upward-facing atlas, matching SVG rotation. */
export function bearing(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, from.y - to.y) * 180 / Math.PI;
}

export function turnDelta(from: number, to: number): number {
  return ((to - from + 540) % 360 + 360) % 360 - 180;
}

export function canTurn(position: Point, from: number, to: number, chairs: readonly Point[]): boolean {
  const delta = turnDelta(from, to);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 10));
  for (let i = 0; i <= steps; i++) {
    const angle = (from + delta * i / steps) * Math.PI / 180;
    const dx = Math.sin(angle) * 22, dy = -Math.cos(angle) * 22;
    if (!clearSegment({ x: position.x - dx, y: position.y - dy }, { x: position.x + dx, y: position.y + dy }, chairs)) return false;
  }
  return true;
}

export function walkTarget(position: Point, chairs: readonly Point[], random: () => number, previousBearing?: number): Point {
  // Follow the room's aisles most of the time. Keep a heading for several
  // stretches instead of choosing another oblique direction at every stop.
  const choice = random();
  const cardinal = () => previousBearing !== undefined && random() < 0.75
    ? Math.round(previousBearing / 90) * 90
    : Math.floor(random() * 4) * 90;
  const preferred = choice < 0.55 ? cardinal()
    : previousBearing !== undefined && choice < 0.85 ? previousBearing
    : (previousBearing ?? Math.floor(random() * 4) * 90) + (random() - 0.5) * 120;
  for (let attempt = 0; attempt < 48; attempt++) {
    // Try shorter stretches of the intended route before turning around an
    // obstacle. Never clamp a destination: that silently changes its heading.
    const angle = (attempt < 12 ? preferred : attempt < 36 ? Math.floor(random() * 4) * 90 : random() * 360) * Math.PI / 180;
    const length = attempt < 12 ? (65 + random() * 145) / (1 + Math.floor(attempt / 4) * 0.5) : 55 + random() * 145;
    const target = {
      x: position.x + Math.sin(angle) * length,
      y: position.y - Math.cos(angle) * length,
    };
    // End only where there is room to turn again; a tight chair gap may be
    // traversed but must not become a dead end that leaves the dog stuck.
    if (chairs.some((chair) => Math.hypot(chair.x - target.x, chair.y - target.y) < 52)) continue;
    if (Math.hypot(target.x - position.x, target.y - position.y) > 30 && canWalk(position, target, chairs)
      && (previousBearing === undefined || canTurn(position, previousBearing, bearing(position, target), chairs))) return target;
  }
  // No safe segment: remain in place and rest rather than crossing furniture.
  return position;
}
