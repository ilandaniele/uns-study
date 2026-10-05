import { describe, expect, it } from "vitest";
import { assertSecureApiUrl } from "../api";

describe("assertSecureApiUrl", () => {
  it("accepts empty, relative and https in production", () => {
    expect(assertSecureApiUrl("", "production")).toBe("");
    expect(assertSecureApiUrl("/api", "production")).toBe("/api");
    expect(assertSecureApiUrl("https://api.example.com", "production")).toBe("https://api.example.com");
  });

  it("rejects plain http in production", () => {
    expect(() => assertSecureApiUrl("http://api.example.com", "production")).toThrow(/https/);
  });

  it("allows http outside production", () => {
    expect(assertSecureApiUrl("http://localhost:4000", "development")).toBe("http://localhost:4000");
  });
});
