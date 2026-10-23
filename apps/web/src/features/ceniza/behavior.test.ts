import { describe, expect, it } from "vitest";
import { frameFor, nextAction, settleFrames, travelProgress, SIDE_SLEEP_FRAME, SIDE_WALK_FRAMES, SLEEP_FRAME, START, STRIDE, WALK_FRAMES, SPRITE_COLUMNS, SPRITE_ROWS, SPRITE_FRAMES, type Point, type Pose } from "./behavior";

describe("Ceniza's decorative routine", () => {
  it("keeps hours of travel inside the room on axis-aligned aisles and crossings", () => {
    let seed = 23;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let position: Point = START;
    let pose: Pose = "rest";
    let duration = 0;
    const seen = new Set<Pose>();
    for (let i = 0; i < 1000; i++) {
      const action = nextAction(position, pose, random);
      expect(action.target.x).toBeGreaterThanOrEqual(110);
      expect(action.target.x).toBeLessThanOrEqual(975);
      expect(action.target.y).toBeGreaterThanOrEqual(335);
      expect(action.target.y).toBeLessThanOrEqual(1335);
      expect(action.target.x === position.x || action.target.y === position.y).toBe(true);
      expect(action.duration).toBeGreaterThan(0);
      if (action.pose === "sleep" || action.pose === "lie" || action.pose === "sprawl") {
        expect(action.duration).toBeGreaterThanOrEqual(240_000);
        expect(action.duration).toBeLessThanOrEqual(1_080_000);
      }
      if (pose !== "walk") expect(action.pose).toBe("walk");
      position = action.target;
      pose = action.pose;
      seen.add(pose);
      duration += action.duration;
    }
    expect(duration).toBeGreaterThan(8 * 3_600_000);
    expect(seen).toEqual(new Set(["walk", "sleep", "lie", "sprawl", "bark", "rest"]));
  });

  it("loops walking frames and keeps sleeping frames static", () => {
    expect(Array.from({ length: SIDE_WALK_FRAMES + 1 }, (_, i) => frameFor("walk", 0, i * STRIDE / SIDE_WALK_FRAMES))).toEqual([...Array.from({ length: SIDE_WALK_FRAMES }, (_, i) => i), 0]);
    expect(frameFor("sleep", 0)).toBe(frameFor("sleep", 900_000));
    expect(frameFor("sleep", 0)).toBe(SLEEP_FRAME);
    expect(frameFor("lie", 0)).toBe(SIDE_SLEEP_FRAME);
    expect(frameFor("sprawl", 0)).toBe(SLEEP_FRAME + 1);
    expect(frameFor("bark", 0)).toBe(SLEEP_FRAME + 2);
    expect(frameFor("bark", 220)).toBe(SLEEP_FRAME + 3);
  });

  it("plants the paws when stopped and uses the direction of travel", () => {
    expect(frameFor("walk", 0, 7)).toBe(frameFor("walk", 10000, 7));
    expect(frameFor("walk", 0, 0, "up")).toBe(8);
    expect(frameFor("walk", 0, STRIDE / 2, "up")).toBe(16);
    expect(frameFor("walk", 0, 0, "down")).toBe(24);
    expect(frameFor("walk", 0, STRIDE / 2, "down")).toBe(32);
  });

  it("covers every phase without leaving the compact atlas", () => {
    for (const heading of ["side", "up", "down"] as const) {
      const count = heading === "side" ? SIDE_WALK_FRAMES : WALK_FRAMES;
      const frames = Array.from({ length: count }, (_, i) => frameFor("walk", 0, (i + 0.5) * STRIDE / count, heading));
      expect(new Set(frames).size).toBe(count);
      for (const frame of frames) {
        expect(frame).toBeLessThan(SPRITE_FRAMES);
        expect(Math.floor(frame / SPRITE_COLUMNS)).toBeLessThan(SPRITE_ROWS);
      }
    }
  });

  it("lowers and raises the body through a reversible sequence for each sleeping style", () => {
    for (const pose of ["sleep", "lie", "sprawl"] as const) {
      const frames = settleFrames(pose);
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.at(-1)).toBe(frameFor(pose, 0));
      expect(settleFrames(pose, true)).toEqual([...frames].reverse());
      expect(frameFor(pose, 900000)).toBe(frameFor(pose, 0));
      expect(frames.every((frame) => frame >= 0 && frame < SPRITE_FRAMES)).toBe(true);
    }
    expect(new Set(["sleep", "lie", "sprawl"].map((pose) => frameFor(pose as Pose, 0))).size).toBe(3);
  });

  it("accelerates briefly and brakes continuously without sliding for a long part of the trip", () => {
    expect(travelProgress(0, 30000)).toBe(0);
    expect(travelProgress(30000, 30000)).toBe(1);
    let previous = 0;
    for (let ms = 0; ms <= 30000; ms += 10) {
      const progress = travelProgress(ms, 30000);
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(progress).toBeLessThanOrEqual(1);
      previous = progress;
    }
    const earlyStride = travelProgress(1500, 30000) - travelProgress(500, 30000);
    const middleStride = travelProgress(16000, 30000) - travelProgress(15000, 30000);
    expect(earlyStride).toBeCloseTo(middleStride, 8);
    const leftSlope = travelProgress(450, 30000) - travelProgress(449, 30000);
    const rightSlope = travelProgress(451, 30000) - travelProgress(450, 30000);
    expect(Math.abs(leftSlope - rightSlope)).toBeLessThan(1e-7);
  });

  it("finishes an aisle or crossing after resuming a suspended tab", () => {
    const vertical = nextAction({ x: 545, y: 710 }, "rest", () => 0);
    expect(vertical.target.x).toBe(545);
    const horizontal = nextAction({ x: 360, y: 635 }, "rest", () => 0.9);
    expect(horizontal.target.y).toBe(635);
  });
});
