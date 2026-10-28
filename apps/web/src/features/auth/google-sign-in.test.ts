import { describe, expect, it } from "vitest";
import { googleReturnError, googleSignInError, googleSignInUrls } from "./google-sign-in";
import { secureWebUrl } from "@/lib/hosts";

describe("Google sign-in recovery", () => {
  it("keeps success and error returns on the same site with a validated next destination", () => {
    const urls = googleSignInUrls("https://saladeestudio.com.ar", "/personas?tab=friends");
    expect(urls.callbackURL).toBe("https://saladeestudio.com.ar/personas?tab=friends");
    const error = new URL(urls.errorCallbackURL); expect(error.pathname).toBe("/login"); expect(error.searchParams.get("oauth")).toBe("google"); expect(error.searchParams.get("next")).toBe("/personas?tab=friends");
    for (const next of ["//evil.example.test", "https://evil.example.test", "/\\evil.example.test"]) expect(googleSignInUrls("https://saladeestudio.com.ar", next).callbackURL).toBe("https://saladeestudio.com.ar/");
  });

  it("gives distinct recovery for linking, browser state, cancellation and account restrictions", () => {
    expect(googleReturnError("account_not_linked").recovery).toBe("code");
    expect(googleReturnError("EMAIL_NOT_VERIFIED").recovery).toBe("code");
    expect(googleReturnError("state_mismatch").message).toContain("otra pestaña");
    expect(googleReturnError("access_denied").recovery).toBe("retry");
    expect(googleReturnError("ACCOUNT_BANNED").recovery).toBe("support");
  });

  it("never displays raw provider descriptions or arbitrary error strings", () => {
    const unsafe = "private@example.test<script>";
    expect(googleReturnError(unsafe).message).not.toContain(unsafe);
    expect(googleReturnError("unknown_private_code").message).not.toContain("unknown_private_code");
  });
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
