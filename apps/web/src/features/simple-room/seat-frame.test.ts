import { describe, expect, it } from "vitest";
import { seatCalibrationSchema } from "@sala/contracts";
import { buildSeatFrame, type SeatFrameInput } from "./seat-frame";

const M = 6_371_000 * Math.PI / 180;
const frame: SeatFrameInput = { latitude: -38.7, longitude: -62.27, widthM: 12, lengthM: 20, bearingDeg: 0, uncertaintyM: .1, source: "Synthetic measured frame; not a real room" };
const seats = [{ id: "a", x: 100, y: 100 }, { id: "b", x: 900, y: 100 }, { id: "c", x: 100, y: 1500 }, { id: "center", x: 500, y: 800 }, { id: "right", x: 750, y: 800 }, { id: "top", x: 500, y: 400 }];
describe("center-based measured seat frame", () => {
  it.each([0, 90, 180, 270, 360])("keeps the center fixed and uses a clockwise top bearing of %s", bearingDeg => {
    const result = buildSeatFrame({ ...frame, bearingDeg }, seats);
    const center = result.positions.find(p => p.seatId === "center")!;
    expect(center.latitude).toBeCloseTo(frame.latitude, 9); expect(center.longitude).toBeCloseTo(frame.longitude, 9);
    const right = result.positions.find(p => p.seatId === "right")!, top = result.positions.find(p => p.seatId === "top")!;
    const offset = (p: typeof right) => [(p.longitude - frame.longitude) * M * Math.cos(frame.latitude * Math.PI / 180), (p.latitude - frame.latitude) * M];
    const angle = bearingDeg * Math.PI / 180;
    expect(offset(right)[0]).toBeCloseTo(3 * Math.cos(angle), 5); expect(offset(right)[1]).toBeCloseTo(-3 * Math.sin(angle), 5);
    expect(offset(top)[0]).toBeCloseTo(5 * Math.sin(angle), 5); expect(offset(top)[1]).toBeCloseTo(5 * Math.cos(angle), 5);
    expect(new Set(result.calibration.anchors.map(a => a.seatId)).size).toBe(3);
  });
  it("preserves every seat ID and keeps the declared uncertainty in its generated anchors", () => {
    const result = buildSeatFrame(frame, seats);
    expect(result.positions.map(p => p.seatId)).toEqual(seats.map(s => s.id));
    expect(result.calibration.uncertaintyM).toBe(.1);
    for (const anchor of result.calibration.anchors) expect(result.positions).toContainEqual(expect.objectContaining(anchor));
    expect(result.calibration.source).toContain(frame.source);
  });
  it("does not treat a large map error as usable device precision", () => {
    expect(buildSeatFrame(frame, seats).maxDeviceAccuracyM).toBeCloseTo(.899, 5);
    expect(buildSeatFrame({ ...frame, uncertaintyM: 2 }, seats).maxDeviceAccuracyM).toBe(0);
    const closeSeats = [...seats, { id: "neighbor", x: 550, y: 800 }];
    expect(buildSeatFrame(frame, closeSeats).maxDeviceAccuracyM).toBeCloseTo(.199, 5);
  });
  it("rejects missing measurements, invalid bounds, duplicate IDs, overlapping or aligned geometry", () => {
    for (const change of [{ widthM: 0 }, { lengthM: NaN }, { bearingDeg: 361 }, { latitude: 86 }, { longitude: 181 }, { uncertaintyM: 0 }, { source: "" }]) expect(() => buildSeatFrame({ ...frame, ...change }, seats)).toThrow();
    expect(() => buildSeatFrame(frame, seats.slice(0, 2))).toThrow();
    expect(() => buildSeatFrame(frame, [seats[0]!, seats[0]!, seats[2]!])).toThrow();
    expect(() => buildSeatFrame(frame, [...seats, { ...seats[0]!, id: "overlap" }])).toThrow();
    expect(() => buildSeatFrame(frame, [{ id: "a", x: 1, y: 1 }, { id: "b", x: 2, y: 2 }, { id: "c", x: 3, y: 3 }])).toThrow();
  });
  it("wraps longitudes without moving the room across the earth", () => {
    const result = buildSeatFrame({ ...frame, longitude: 180 }, seats);
    expect(result.positions.every(p => p.longitude >= -180 && p.longitude <= 180)).toBe(true);
  });
  it("produces a payload accepted by the existing strict calibration contract", () => {
    const identified = seats.map((s, i) => ({ ...s, id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
    const result = buildSeatFrame(frame, identified);
    expect(seatCalibrationSchema.parse(result.calibration)).toEqual(result.calibration);
  });
});
