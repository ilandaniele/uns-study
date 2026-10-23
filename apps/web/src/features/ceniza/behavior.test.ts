import { describe, expect, it } from "vitest";
import { frameFor, nextAction, settleFrames, travelProgress, SIDE_SLEEP_FRAME, SLEEP_FRAME, START, STRIDE, WALK_FRAMES, SPRITE_COLUMNS, SPRITE_ROWS, SPRITE_FRAMES, type Point, type Pose } from "./behavior";
import { bearing, canWalk, FLOOR, turnDelta } from "./navigation";
import { photoSkinFor } from "../room/photo-skin";

const chairs = Array.from(photoSkinFor({ room: { id: "test", slug: "principal", name: "Test", description: null, timezone: "America/Argentina/Buenos_Aires" }, seats: [] })!.seats.values());

describe("Ceniza's decorative routine", () => {
  it.each([23, 71, 409])("follows aisles with occasional diagonals for hours without crossing chairs (seed %i)", (initialSeed) => {
    let seed = initialSeed;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let position: Point = START;
    let pose: Pose = "rest";
    let duration = 0;
    const seen = new Set<Pose>();
    let diagonalSegments = 0;
    let straightSegments = 0;
    let continuedSegments = 0;
    let previousBearing: number | undefined;
    for (let i = 0; i < 1000; i++) {
      const action = nextAction(position, pose, random, chairs, previousBearing);
      expect(action.target.x).toBeGreaterThanOrEqual(FLOOR.left);
      expect(action.target.x).toBeLessThanOrEqual(FLOOR.right);
      expect(action.target.y).toBeGreaterThanOrEqual(FLOOR.top);
      expect(action.target.y).toBeLessThanOrEqual(FLOOR.bottom);
      expect(canWalk(position, action.target, chairs)).toBe(true);
      if (action.pose === "walk") {
        const heading = bearing(position, action.target);
        if (previousBearing !== undefined && Math.abs(turnDelta(previousBearing, heading)) < 0.01) continuedSegments++;
        previousBearing = bearing(position, action.target);
        if (Math.abs(action.target.x - position.x) > 5 && Math.abs(action.target.y - position.y) > 5) diagonalSegments++;
        else straightSegments++;
      }
      expect(action.duration).toBeGreaterThan(0);
      if (action.pose === "sleep" || action.pose === "lie" || action.pose === "sprawl") {
        expect(action.duration).toBeGreaterThanOrEqual(240_000);
        expect(action.duration).toBeLessThanOrEqual(1_080_000);
      }
      if (pose !== "walk") expect(["walk", "rest"]).toContain(action.pose);
      position = action.target;
      pose = action.pose;
      seen.add(pose);
      duration += action.duration;
    }
    expect(duration).toBeGreaterThan(8 * 3_600_000);
    expect(diagonalSegments).toBeGreaterThan(10);
    expect(straightSegments).toBeGreaterThan(diagonalSegments * 2);
    expect(continuedSegments).toBeGreaterThan(100);
    expect(seen).toEqual(new Set(["walk", "sleep", "lie", "sprawl", "bark", "rest"]));
  });

  it("loops walking frames and keeps sleeping frames static", () => {
    expect(Array.from({ length: WALK_FRAMES + 1 }, (_, i) => frameFor("walk", 0, i * STRIDE / WALK_FRAMES))).toEqual([...Array.from({ length: WALK_FRAMES }, (_, i) => i), 0]);
    expect(frameFor("sleep", 0)).toBe(frameFor("sleep", 900_000));
    expect(frameFor("sleep", 0)).toBe(SLEEP_FRAME);
    expect(frameFor("lie", 0)).toBe(SIDE_SLEEP_FRAME);
    expect(frameFor("sprawl", 0)).toBe(SLEEP_FRAME + 1);
    expect(frameFor("bark", 0)).toBe(SLEEP_FRAME + 2);
    expect(frameFor("bark", 220)).toBe(SLEEP_FRAME + 3);
  });

  it("plants the paws when stopped and points the nose along the actual travel vector", () => {
    expect(frameFor("walk", 0, 7)).toBe(frameFor("walk", 10000, 7));
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(0);
    expect(bearing({ x: 0, y: 0 }, { x: 10, y: -10 })).toBe(45);
    expect(bearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(90);
    expect(bearing({ x: 0, y: 0 }, { x: -10, y: 10 })).toBe(-135);
    expect(turnDelta(170, -170)).toBe(20);
    expect(turnDelta(-170, 170)).toBe(-20);
  });

  it("covers every phase without leaving the compact atlas", () => {
    {
      const count = WALK_FRAMES;
      const frames = Array.from({ length: count }, (_, i) => frameFor("walk", 0, (i + 0.5) * STRIDE / count));
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

  it("rejects a segment crossing a chair even when its destination is clear", () => {
    expect(canWalk({ x: 400, y: 500 }, { x: 600, y: 700 }, [{ x: 500, y: 600 }])).toBe(false);
    expect(canWalk({ x: 400, y: 500 }, { x: 600, y: 500 }, [{ x: 500, y: 600 }])).toBe(true);
    expect(canWalk(START, { x: 0, y: 0 }, [])).toBe(false);
    const trapped = nextAction(START, "rest", () => 0.5, [START]);
    expect(trapped.pose).toBe("rest");
    expect(trapped.target).toEqual(START);
  });
});
