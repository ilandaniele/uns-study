/** Decorative animation only: coordinates are photo pixels, independent of seat state. */
import { walkTarget } from "./navigation";
export interface Point { x: number; y: number }
export type Pose = "walk" | "sleep" | "lie" | "sprawl" | "bark" | "rest";
export interface Action { pose: Pose; target: Point; duration: number }
export const START: Point = { x: 545, y: 1145 };

export function nextAction(position: Point, previous: Pose, random: () => number = Math.random, chairs: readonly Point[] = [], previousBearing?: number): Action {
  const roll = random();
  // Every nap/rest ends with a walk; walking can continue across several segments.
  if (previous === "walk" && roll < 0.32) {
    const style = random();
    return { pose: style < 0.3 ? "sleep" : style < 0.7 ? "lie" : "sprawl", target: position, duration: (4 + random() * 14) * 60_000 };
  }
  if (previous === "walk" && roll < 0.48) {
    return { pose: "rest", target: position, duration: 20_000 + random() * 70_000 };
  }
  if (previous === "walk" && roll < 0.52) {
    return { pose: "bark", target: position, duration: 1_200 + random() * 1_000 };
  }
  const target = walkTarget(position, chairs, random, previousBearing);
  if (target === position) return { pose: "rest", target, duration: 10_000 };
  return { pose: "walk", target, duration: Math.hypot(target.x - position.x, target.y - position.y) / (20 + random() * 10) * 1_000 };
}

export const WALK_FRAMES = 8;
export const SLEEP_FRAME = 8;
export const SETTLE_START = 12;
export const SIDE_SLEEP_FRAME = 19;
export const SPRITE_FRAMES = 20;
export const SPRITE_COLUMNS = 8;
export const SPRITE_ROWS = Math.ceil(SPRITE_FRAMES / SPRITE_COLUMNS);
// Full gait cycle in photo pixels: slowing travel also slows the paws.
export const STRIDE = 28;
/** Brief, fixed-duration acceleration rather than sliding for 10% of a long trip. */
export function travelProgress(elapsed: number, duration: number): number {
  const t = Math.max(0, Math.min(elapsed, duration));
  const ramp = Math.min(450, duration / 3);
  const speed = 1 / (duration - ramp);
  if (t < ramp) return speed * t * t / (2 * ramp);
  if (t > duration - ramp) return 1 - speed * (duration - t) ** 2 / (2 * ramp);
  return speed * (t - ramp / 2);
}

/** Play only on posture changes; long naps keep a single still frame and no RAF. */
export function settleFrames(pose: Pose, waking = false): readonly number[] {
  const sequence = pose === "sprawl"
    ? [12, 13, 14, 15, 16, 17, 18, SLEEP_FRAME + 1]
    : pose === "lie"
    ? Array.from({ length: 8 }, (_, i) => SETTLE_START + i)
    : pose === "sleep" ? [12, 13, 14, 15, SLEEP_FRAME] : [];
  return waking ? [...sequence].reverse() : sequence;
}

export function frameFor(pose: Pose, elapsed: number, distance = 0): number {
  if (pose === "walk") {
    return Math.floor(((distance % STRIDE) / STRIDE) * WALK_FRAMES);
  }
  if (pose === "sleep") return SLEEP_FRAME;
  if (pose === "lie") return SIDE_SLEEP_FRAME;
  if (pose === "sprawl") return SLEEP_FRAME + 1;
  if (pose === "bark") return SLEEP_FRAME + (Math.floor(elapsed / 220) % 2 === 0 ? 2 : 3);
  return SLEEP_FRAME + 3;
}
