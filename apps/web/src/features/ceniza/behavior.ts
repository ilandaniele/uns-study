/** Decorative animation only: coordinates are photo pixels, independent of seat state. */
export interface Point { x: number; y: number }
export type Pose = "walk" | "sleep" | "lie" | "sprawl" | "bark" | "rest";
export interface Action { pose: Pose; target: Point; duration: number }
// Forward/backward travel only: do not introduce a lateral (crab-walking) segment.
const CROSSINGS = [335, 435, 535, 635, 735, 837, 940, 1044, 1145, 1248, 1335];
export const START: Point = { x: 545, y: 1145 };
const choose = <T,>(items: readonly T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

export function nextAction(position: Point, previous: Pose, random: () => number = Math.random): Action {
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
  const target = { x: position.x, y: choose(CROSSINGS.filter((y) => y !== position.y), random) };
  return { pose: "walk", target, duration: Math.hypot(target.x - position.x, target.y - position.y) / (20 + random() * 10) * 1_000 };
}

export type Heading = "side" | "up" | "down";
export const WALK_FRAMES = 16;
export const SIDE_WALK_FRAMES = 8;
export const SLEEP_FRAME = 40;
export const SETTLE_START = 44;
export const SIDE_SLEEP_FRAME = 51;
export const SPRITE_FRAMES = 52;
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
    ? [44, 45, 46, 47, 48, 49, 50, SLEEP_FRAME + 1]
    : pose === "lie"
    ? Array.from({ length: 8 }, (_, i) => SETTLE_START + i)
    : pose === "sleep" ? [44, 45, 46, 47, SLEEP_FRAME] : [];
  return waking ? [...sequence].reverse() : sequence;
}

export function frameFor(pose: Pose, elapsed: number, distance = 0, heading: Heading = "side"): number {
  if (pose === "walk") {
    const count = heading === "side" ? SIDE_WALK_FRAMES : WALK_FRAMES;
    const start = heading === "up" ? SIDE_WALK_FRAMES : heading === "down" ? SIDE_WALK_FRAMES + WALK_FRAMES : 0;
    return start + Math.floor(((distance % STRIDE) / STRIDE) * count);
  }
  if (pose === "sleep") return SLEEP_FRAME;
  if (pose === "lie") return SIDE_SLEEP_FRAME;
  if (pose === "sprawl") return SLEEP_FRAME + 1;
  if (pose === "bark") return SLEEP_FRAME + (Math.floor(elapsed / 220) % 2 === 0 ? 2 : 3);
  return SLEEP_FRAME + 3;
}
