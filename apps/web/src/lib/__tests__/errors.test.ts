import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../api";
import { describeActionError } from "../errors";

function apiError(code: string): ApiRequestError {
  return new ApiRequestError({ error: { code: code as never, message: "boom" } }, 409);
}

describe("describeActionError", () => {
  it("maps DISPUTE_NOT_ALLOWED to Spanish copy", () => {
    expect(describeActionError(apiError("DISPUTE_NOT_ALLOWED"))).toBe("No podés abrir esta votación para este lugar.");
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
    expect(describeActionError(new Error("network down"))).toBe("No pudimos actualizar el lugar. Tu cambio no fue guardado.");
  });
});
