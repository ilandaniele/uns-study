import { describe, expect, it } from "vitest";
import {
  checkInRequestSchema,
  locationInputSchema,
  observationRequestSchema,
  presenceValidateSchema,
  extendRequestSchema,
  createQrCodeSchema,
  updateGeofenceSchema,
} from "./index.js";
import { proposeTableNameSchema } from "./table-names.js";

const ROOM = "11111111-1111-4111-8111-111111111111";
const SEAT = "22222222-2222-4222-8222-222222222222";

const validLocation = {
  latitude: -38.702,
  longitude: -62.269,
  accuracy: 20,
  capturedAt: new Date().toISOString(),
};

describe("locationInputSchema", () => {
  it("accepts a valid location", () => {
    expect(locationInputSchema.safeParse(validLocation).success).toBe(true);
  });

  it("rejects out-of-range latitude", () => {
    expect(
      locationInputSchema.safeParse({ ...validLocation, latitude: 200 }).success,
    ).toBe(false);
  });
});

describe("checkInRequestSchema", () => {
  it("defaults showIdentity to false", () => {
    const parsed = checkInRequestSchema.parse({
      roomId: ROOM,
      seatId: SEAT,
      location: validLocation,
    });
    expect(parsed.showIdentity).toBe(false);
  });

  it("defaults durationMinutes to 180 and bounds it to 15..720", () => {
    const base = { roomId: ROOM, seatId: SEAT, location: validLocation };
    expect(checkInRequestSchema.parse(base).durationMinutes).toBe(180);
    expect(checkInRequestSchema.parse({ ...base, durationMinutes: 15 }).durationMinutes).toBe(15);
    expect(checkInRequestSchema.safeParse({ ...base, durationMinutes: 14 }).success).toBe(false);
    expect(checkInRequestSchema.safeParse({ ...base, durationMinutes: 721 }).success).toBe(false);
    expect(checkInRequestSchema.safeParse({ ...base, durationMinutes: 30.5 }).success).toBe(false);
  });
});

describe("observationRequestSchema", () => {
  it("requires status to be FREE or OCCUPIED", () => {
    const result = observationRequestSchema.safeParse({
      roomId: ROOM,
      seatId: SEAT,
      status: "MAYBE",
      location: validLocation,
    });
    expect(result.success).toBe(false);
  });

  it("accepts SAVED", () => {
    const result = observationRequestSchema.safeParse({
      roomId: ROOM,
      seatId: SEAT,
      status: "SAVED",
      location: validLocation,
    });
    expect(result.success).toBe(true);
  });
});

describe("extendRequestSchema", () => {
  it("makes location optional (the API falls back to the presence grant) but validates one when sent", () => {
    expect(extendRequestSchema.safeParse({}).success).toBe(true);
    expect(extendRequestSchema.safeParse({ location: { ...validLocation, latitude: 200 } }).success).toBe(false);
  });

  it("defaults durationMinutes to 180 and bounds it", () => {
    expect(extendRequestSchema.parse({ location: validLocation }).durationMinutes).toBe(180);
    expect(extendRequestSchema.parse({ location: validLocation, durationMinutes: 60 }).durationMinutes).toBe(60);
    expect(extendRequestSchema.safeParse({ location: validLocation, durationMinutes: 10 }).success).toBe(false);
  });
});

describe("presenceValidateSchema", () => {
  it("accepts a valid payload", () => {
    const result = presenceValidateSchema.safeParse({
      roomId: ROOM,
      ...validLocation,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateGeofenceSchema", () => {
  const valid = { latitude: -38.701, longitude: -62.27, radiusM: 50 };

  it("accepts a valid payload", () => {
    expect(updateGeofenceSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a radius below 20m", () => {
    expect(updateGeofenceSchema.safeParse({ ...valid, radiusM: 19 }).success).toBe(false);
  });

  it("rejects a radius above 300m", () => {
    expect(updateGeofenceSchema.safeParse({ ...valid, radiusM: 301 }).success).toBe(false);
  });

  it("rejects a non-integer radius", () => {
    expect(updateGeofenceSchema.safeParse({ ...valid, radiusM: 50.5 }).success).toBe(false);
  });
});

describe("proposeTableNameSchema", () => {
  it("accepts a normal name", () => {
    expect(proposeTableNameSchema.safeParse({ name: "La Pecera" }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = proposeTableNameSchema.safeParse({ name: "  La Pecera  " });
    expect(result.success && result.data.name).toBe("La Pecera");
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(proposeTableNameSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("rejects a name longer than 24 characters", () => {
    expect(proposeTableNameSchema.safeParse({ name: "A".repeat(25) }).success).toBe(false);
  });

  it("rejects characters outside letters/numbers/basic punctuation", () => {
    expect(proposeTableNameSchema.safeParse({ name: "Mesa <script>" }).success).toBe(false);
    expect(proposeTableNameSchema.safeParse({ name: "Mesa_1" }).success).toBe(false);
  });

  it("accepts accented letters and basic punctuation", () => {
    expect(proposeTableNameSchema.safeParse({ name: "¡La Peña!" }).success).toBe(true);
  });
});

describe("request string bounds", () => {
  const base = { roomId: ROOM, seatId: SEAT, location: validLocation };

  it("rejects non-uuid room/seat ids and oversized qr tokens on check-in", () => {
    expect(checkInRequestSchema.safeParse({ ...base, roomId: "x" }).success).toBe(false);
    expect(checkInRequestSchema.safeParse({ ...base, seatId: "x" }).success).toBe(false);
    expect(checkInRequestSchema.safeParse({ ...base, qrToken: "a".repeat(129) }).success).toBe(false);
    expect(checkInRequestSchema.safeParse({ ...base, qrToken: "a".repeat(32) }).success).toBe(true);
  });

  it("requires ISO datetimes for capturedAt/sentAt", () => {
    expect(locationInputSchema.safeParse({ ...validLocation, capturedAt: "yesterday" }).success).toBe(false);
    expect(locationInputSchema.safeParse({ ...validLocation, sentAt: "x".repeat(500) }).success).toBe(false);
  });

  it("caps presence roomId length (id or slug)", () => {
    const p = { latitude: 0, longitude: 0, accuracy: 1, capturedAt: validLocation.capturedAt };
    expect(presenceValidateSchema.safeParse({ ...p, roomId: "sala-108" }).success).toBe(true);
    expect(presenceValidateSchema.safeParse({ ...p, roomId: "a".repeat(101) }).success).toBe(false);
  });

  it("caps the qr tableCode at 50 chars", () => {
    expect(createQrCodeSchema.safeParse({}).success).toBe(true);
    expect(createQrCodeSchema.safeParse({ tableCode: "a".repeat(51) }).success).toBe(false);
  });
});
