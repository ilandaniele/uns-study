import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../api";
import { describeActionError } from "../errors";
import { GeolocationRequestError } from "../geolocation";

function apiError(code: string): ApiRequestError {
  return new ApiRequestError({ error: { code: code as never, message: "boom" } }, 409);
}

describe("describeActionError", () => {
  it("shows the server's own message for DISPUTE_NOT_ALLOWED", () => {
    expect(describeActionError(apiError("DISPUTE_NOT_ALLOWED"))).toBe("boom");
  });

  it("shows the server's own message for any other unmapped API error code", () => {
    expect(describeActionError(apiError("SOME_NEW_CODE"))).toBe("boom");
  });

  it("reports a network failure distinctly from a generic API error", () => {
    expect(describeActionError(new TypeError("Failed to fetch"))).toBe("Sin conexión. Revisá tu internet y probá de nuevo.");
  });

  it("maps DISPUTE_ALREADY_OPEN to Spanish copy", () => {
    expect(describeActionError(apiError("DISPUTE_ALREADY_OPEN"))).toBe("Ya hay una votación en curso para este lugar.");
  });

  it("maps DISPUTE_CLOSED to Spanish copy", () => {
    expect(describeActionError(apiError("DISPUTE_CLOSED"))).toBe("Esta votación ya terminó.");
  });

  it("maps SEAT_VERIFIED to Spanish copy", () => {
    expect(describeActionError(apiError("SEAT_VERIFIED"))).toBe("Este lugar está verificado con foto: la persona está sentada acá.");
  });

  it("maps ALREADY_VERIFIED to Spanish copy", () => {
    expect(describeActionError(apiError("ALREADY_VERIFIED"))).toBe(
      "Ya verificaste este lugar. Para volver a verificar, marcá “Estoy acá” de nuevo cuando te sientes.",
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(describeActionError(new Error("network down"))).toBe("No pudimos actualizar el lugar. Tu cambio no se guardó: probá de nuevo.");
  });
});

describe("describeActionError geolocation mapping", () => {
  it("passes the UNAVAILABLE message through as-is", () => {
    const err = new GeolocationRequestError("UNAVAILABLE", "Tu dispositivo tiene la ubicación apagada. Activala y probá de nuevo.");
    expect(describeActionError(err)).toBe("Tu dispositivo tiene la ubicación apagada. Activala y probá de nuevo.");
  });

  it("appends the precise-location tip to a COARSE fix", () => {
    const err = new GeolocationRequestError("COARSE", "Tu ubicación es muy poco precisa.");
    expect(describeActionError(err)).toContain("Tu ubicación es muy poco precisa.");
    expect(describeActionError(err).toLowerCase()).toContain("activá");
  });

  it("appends how to re-enable a denied permission", () => {
    const err = new GeolocationRequestError("PERMISSION_DENIED", "Permiso de ubicación denegado.");
    expect(describeActionError(err)).toContain("Necesitamos tu ubicación");
    expect(describeActionError(err)).toMatch(/reactivarla/);
  });
});

describe("presence rejection details", () => {
  it("explains distance and tolerance when outside the geofence", () => {
    const err = new ApiRequestError(
      { error: { code: "PRESENCE_REJECTED", message: "x", reason: "OUTSIDE_GEOFENCE", details: { distanceM: 180, accuracyM: 40, radiusM: 50, allowedM: 70 } } },
      403,
    );
    expect(describeActionError(err)).toContain("unos 180 m");
    expect(describeActionError(err)).toContain("hasta 70 m");
  });
});
