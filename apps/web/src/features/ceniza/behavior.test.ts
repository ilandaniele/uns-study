import { describe, expect, it } from "vitest";
import { frameFor, nextAction, START, type Point, type Pose } from "./behavior";

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
      if (action.pose === "sleep" || action.pose === "lie") {
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
    expect(seen).toEqual(new Set(["walk", "sleep", "lie", "bark", "rest"]));
  });

  it("loops walking frames and keeps sleeping frames static", () => {
    expect([0, 140, 280, 420, 560, 700].map((ms) => frameFor("walk", ms))).toEqual([0, 1, 2, 3, 4, 0]);
    expect(frameFor("sleep", 0)).toBe(frameFor("sleep", 900_000));
    expect(frameFor("lie", 0)).toBe(6);
    expect(frameFor("bark", 0)).toBe(7);
    expect(frameFor("bark", 220)).toBe(8);
  });

  it("finishes an aisle or crossing after resuming a suspended tab", () => {
    const vertical = nextAction({ x: 545, y: 710 }, "rest", () => 0);
    expect(vertical.target.x).toBe(545);
    const horizontal = nextAction({ x: 360, y: 635 }, "rest", () => 0.9);
    expect(horizontal.target.y).toBe(635);
  });
});
