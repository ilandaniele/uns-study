/** Decorative animation only: coordinates are photo pixels, independent of seat state. */
export interface Point { x: number; y: number }
export type Pose = "walk" | "sleep" | "lie" | "bark" | "rest";
export interface Action { pose: Pose; target: Point; duration: number }
const AISLES = [110, 545, 975];
// Cross the room between chair rows, or beneath the tabletops. Never cross a chair row.
const CROSSINGS = [335, 435, 535, 635, 735, 837, 940, 1044, 1145, 1248, 1335];
export const START: Point = { x: 545, y: 1145 };
const choose = <T,>(items: readonly T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

export function nextAction(position: Point, previous: Pose, random: () => number = Math.random): Action {
  const roll = random();
  // Every nap/rest ends with a walk; walking can continue across several segments.
  if (previous === "walk" && roll < 0.32) {
    return { pose: random() < 0.7 ? "sleep" : "lie", target: position, duration: (4 + random() * 14) * 60_000 };
  }
  if (previous === "walk" && roll < 0.48) {
    return { pose: "rest", target: position, duration: 20_000 + random() * 70_000 };
  }
  if (previous === "walk" && roll < 0.52) {
    return { pose: "bark", target: position, duration: 1_200 + random() * 1_000 };
  }
  // A tab can be suspended halfway along an aisle: reach a crossing before turning.
  const horizontal = (random() < 0.45 || !AISLES.includes(position.x)) && CROSSINGS.includes(position.y);
  const target = horizontal
    ? { x: choose(AISLES.filter((x) => x !== position.x), random), y: position.y }
    : { x: position.x, y: choose(CROSSINGS.filter((y) => y !== position.y), random) };
  return { pose: "walk", target, duration: Math.hypot(target.x - position.x, target.y - position.y) / (20 + random() * 10) * 1_000 };
}

export type Heading = "side" | "up" | "down";
export const WALK_FRAMES = 16;
export const SLEEP_FRAME = WALK_FRAMES * 3;
export const SPRITE_FRAMES = SLEEP_FRAME + 4;
export const SPRITE_COLUMNS = 8;
export const SPRITE_ROWS = Math.ceil(SPRITE_FRAMES / SPRITE_COLUMNS);
// Full gait cycle in photo pixels: slowing travel also slows the paws.
export const STRIDE = 28;
export function frameFor(pose: Pose, elapsed: number, distance = 0, heading: Heading = "side"): number {
  if (pose === "walk") {
    const start = heading === "up" ? WALK_FRAMES : heading === "down" ? WALK_FRAMES * 2 : 0;
    return start + Math.floor(((distance % STRIDE) / STRIDE) * WALK_FRAMES);
  }
  if (pose === "sleep") return SLEEP_FRAME;
  if (pose === "lie") return SLEEP_FRAME + 1;
  if (pose === "bark") return SLEEP_FRAME + (Math.floor(elapsed / 220) % 2 === 0 ? 2 : 3);
  return SLEEP_FRAME + 3;
}
