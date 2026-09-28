import { describe, expect, it } from "vitest";
import {
  checkInRequestSchema,
  locationInputSchema,
  observationRequestSchema,
  presenceValidateSchema,
  extendRequestSchema,
  updateGeofenceSchema,
} from "./index.js";
import { proposeTableNameSchema } from "./table-names.js";

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
      roomId: "room-1",
      seatId: "seat-1",
      location: validLocation,
    });
    expect(parsed.showIdentity).toBe(false);
  });
});

describe("observationRequestSchema", () => {
  it("requires status to be FREE or OCCUPIED", () => {
    const result = observationRequestSchema.safeParse({
      roomId: "room-1",
      seatId: "seat-1",
      status: "MAYBE",
      location: validLocation,
    });
    expect(result.success).toBe(false);
  });
});

describe("extendRequestSchema", () => {
  it("requires location", () => {
    expect(extendRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("presenceValidateSchema", () => {
  it("accepts a valid payload", () => {
    const result = presenceValidateSchema.safeParse({
      roomId: "room-1",
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
