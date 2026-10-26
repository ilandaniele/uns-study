import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import { describeActionError } from "./errors";

describe("seat rate-limit messages", () => {
  it("keeps the distinct-seat wait time supplied by the server", () => {
    const message = "Actualizaste muchos lugares distintos. Esperá hasta 10 minutos antes de marcar otro lugar.";
    expect(describeActionError(new ApiRequestError({ error: { code: "RATE_LIMITED", message } }, 429))).toBe(message);
  });

  it("does not suggest that solving Turnstile bypasses the minute limit", () => {
    const error = new ApiRequestError({ error: { code: "RATE_LIMITED", message: "Demasiados intentos, esperá un momento." } }, 429);
    expect(describeActionError(error)).toContain("Esperá un minuto");
    expect(describeActionError(error)).toContain("no elimina este límite temporal");
  });
});
