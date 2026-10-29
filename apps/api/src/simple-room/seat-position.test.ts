import { describe, expect, it } from "vitest";
import type { LocationInput, SeatCalibrationInput, SeatDto } from "@sala/contracts";
import { buildSeatProjection, seatLayoutHash, selectSimpleSeat } from "./seat-position.js";

const M = 6_371_000 * Math.PI / 180;
const origin = { latitude: -38.7, longitude: -62.27 };
const seat = (id: string, x: number, y: number, status: SeatDto["status"] = "FREE"): SeatDto => ({ id, tableId: "table", code: id, seatNumber: 1, x, y, rotation: 0, status, confidence: 1, lastUpdatedAt: null, sourceSummary: null, dispute: null, verified: false, occupiedUntil: null });
const seats = [seat("target", 300, 600), seat("neighbor", 380, 600), seat("lower", 300, 664), seat("ref-a", 100, 100), seat("ref-b", 900, 100), seat("ref-c", 100, 1500)];
function geo(x: number, y: number, angle = 0) {
  const east = x / 1000 * 10, north = y / 1600 * 20;
  return { latitude: origin.latitude + (east * Math.sin(angle) + north * Math.cos(angle)) / M, longitude: origin.longitude + (east * Math.cos(angle) - north * Math.sin(angle)) / (M * Math.cos(origin.latitude * Math.PI / 180)) };
}
function calibration(angle = 0): SeatCalibrationInput {
  return { anchors: seats.slice(3).map(s => ({ seatId: s.id, ...geo(s.x, s.y, angle) })) as SeatCalibrationInput["anchors"], uncertaintyM: 0.1, source: "Synthetic measured references" };
}
const location = (x = 300, y = 600, accuracy = 0.05, angle = 0): LocationInput => ({ ...geo(x, y, angle), accuracy, capturedAt: new Date().toISOString() });

describe("measured seat positioning", () => {
  it.each([0, Math.PI / 4, Math.PI / 2, -Math.PI / 3])("matches a precise fix after rotating the real room by %s", angle => {
    expect(selectSimpleSeat(location(300, 600, 0.05, angle), calibration(angle), seats)).toEqual({ seatId: "target" });
    const model = buildSeatProjection(calibration(angle), seats);
    expect(model.widthM).toBeCloseTo(10, 5); expect(model.depthM).toBeCloseTo(20, 5);
    expect(model.geographic(seats[0]!).latitude).toBeCloseTo(geo(300, 600, angle).latitude, 9);
  });
  it("requires the complete uncertainty circle to fit against every neighboring chair", () => {
    expect(selectSimpleSeat(location(340, 600, 0.05), calibration(), seats)).toMatchObject({ outcome: "CONFIRM", reason: "AMBIGUOUS" });
    expect(selectSimpleSeat(location(300, 600, 5), calibration(), seats)).toMatchObject({ outcome: "CONFIRM" });
    expect(selectSimpleSeat(location(), { ...calibration(), uncertaintyM: 0.5 }, seats)).toMatchObject({ outcome: "CONFIRM" });
  });
  it("does not skip a physically closer occupied, guarded or disputed chair", () => {
    for (const status of ["OCCUPIED", "SAVED", "UNCERTAIN"] as const) {
      const unavailable = seats.map(s => s.id === "target" ? { ...s, status } : s);
      expect(selectSimpleSeat(location(), calibration(), unavailable)).toMatchObject({ outcome: "CONFIRM", reason: "NEAREST_UNAVAILABLE", suggestedSeatId: null });
    }
  });
  it("accepts an explicit self check-in into UNKNOWN only when the position identifies one chair", () => {
    const unknown = seats.map(s => ({ ...s, status: "UNKNOWN" as const }));
    expect(selectSimpleSeat(location(), calibration(), unknown)).toEqual({ seatId: "target" });
    expect(selectSimpleSeat(location(340, 600), calibration(), unknown)).toMatchObject({ outcome: "CONFIRM", reason: "AMBIGUOUS" });
    expect(selectSimpleSeat(location(), calibration(), unknown.map(s => s.id === "target" ? { ...s, occupiedUntil: new Date(Date.now() + 60_000).toISOString() } : s))).toMatchObject({ outcome: "CONFIRM", reason: "NEAREST_UNAVAILABLE" });
  });
  it("requires a recent positive-accuracy fix and refuses a distant or exterior location", () => {
    const delayed = new Date(Date.now() - 20_000).toISOString();
    for (const fix of [location(300, 600, 0), { ...location(), capturedAt: delayed }, { ...location(), capturedAt: delayed, sentAt: delayed }, location(-10, 600), location(550, 900)]) {
      expect(selectSimpleSeat(fix, calibration(), seats)).toMatchObject({ outcome: "CONFIRM" });
    }
  });
  it("rejects duplicate, collinear and collapsed references", () => {
    const input = calibration();
    expect(() => buildSeatProjection({ ...input, anchors: [input.anchors[0], input.anchors[0], input.anchors[2]] }, seats)).toThrow();
    const aligned = [seat("a", 100, 100), seat("b", 200, 100), seat("c", 300, 100)];
    expect(() => buildSeatProjection({ ...input, anchors: aligned.map(s => ({ seatId: s.id, ...geo(s.x, s.y) })) as SeatCalibrationInput["anchors"] }, aligned)).toThrow(/alineadas/);
    expect(() => buildSeatProjection({ ...input, anchors: input.anchors.map(a => ({ ...a, ...origin })) as SeatCalibrationInput["anchors"] }, seats)).toThrow(/dimensiones/);
  });
  it("invalidates moved/added seats while keeping calibration across live status changes", async () => {
    const hash = await seatLayoutHash(seats);
    expect(await seatLayoutHash([...seats].reverse().map(s => ({ ...s, status: "UNKNOWN" })))).toBe(hash);
    expect(await seatLayoutHash(seats.map((s, i) => i ? s : { ...s, x: s.x + 1 }))).not.toBe(hash);
    expect(await seatLayoutHash(seats.slice(1))).not.toBe(hash);
  });
});
