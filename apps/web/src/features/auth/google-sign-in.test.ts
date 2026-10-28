import { describe, expect, it } from "vitest";
import { googleSignInError } from "./google-sign-in";
import { secureWebUrl } from "@/lib/hosts";

describe("Google sign-in recovery", () => {
  it("offers code sign-in rather than requiring a password a Google user may not have", () => {
    expect(googleSignInError({ code: "UNKNOWN" })).toContain("código por email");
    expect(googleSignInError()).not.toContain("contraseña");
  });

  it("explains rate limits and unsafe callback origins without displaying raw provider messages", () => {
    expect(googleSignInError({ status: 429 })).toContain("Esperá");
    expect(googleSignInError({ code: "INVALID_CALLBACK_URL" })).toContain("https://saladeestudio.com.ar/login");
    expect(googleSignInError({ code: "INVALID_ORIGIN" })).toContain("https://saladeestudio.com.ar/login");
  });

  it("upgrades a stale HTTP login tab while retaining its destination", () => {
    expect(secureWebUrl("http://saladeestudio.com.ar/login?next=%2Fjardin#form"))
      .toBe("https://saladeestudio.com.ar/login?next=%2Fjardin#form");
    expect(secureWebUrl("http://dev.saladeestudio.com.ar/login")).toBe("https://dev.saladeestudio.com.ar/login");
    expect(secureWebUrl("http://www.saladeestudio.com.ar/login")).toBe("https://saladeestudio.com.ar/login");
  });

  it("does not rewrite HTTPS, local development, malformed URLs or lookalike hosts", () => {
    for (const url of ["https://saladeestudio.com.ar/login", "http://localhost:3000/login", "http://saladeestudio.com.ar.evil.test/login", "invalid"]) {
      expect(secureWebUrl(url)).toBeNull();
    }
  });
});
