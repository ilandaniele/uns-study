import { describe, expect, it } from "vitest";
import { isPromptRoute, isSnoozed, shouldShowPushPrompt } from "./push-prompt";

const base = {
  signedIn: true,
  support: "available" as const,
  permission: "default" as const,
  hasSubscription: false,
  snoozedUntil: null,
  now: 1_000,
  pathname: "/",
};

describe("shouldShowPushPrompt", () => {
  it("shows when everything lines up", () => {
    expect(shouldShowPushPrompt(base)).toBe(true);
  });
  it("hides when signed out, unsupported, decided, or subscribed", () => {
    expect(shouldShowPushPrompt({ ...base, signedIn: false })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, support: "ios-needs-install" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, support: "denied" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, hasSubscription: true })).toBe(false);
  });
  it("hides while snoozed and shows after it expires", () => {
    expect(shouldShowPushPrompt({ ...base, snoozedUntil: 2_000 })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, snoozedUntil: 1_000 })).toBe(true);
  });
  it("hides on auth routes", () => {
    expect(shouldShowPushPrompt({ ...base, pathname: "/login" })).toBe(false);
  });
});

describe("helpers", () => {
  it("isSnoozed ignores null and NaN", () => {
    expect(isSnoozed(null, 1)).toBe(false);
    expect(isSnoozed(Number.NaN, 1)).toBe(false);
    expect(isSnoozed(5, 1)).toBe(true);
  });
  it("isPromptRoute matches prefixes only on segment boundaries", () => {
    expect(isPromptRoute("/login/foo")).toBe(false);
    expect(isPromptRoute("/loginx")).toBe(true);
    expect(isPromptRoute("/sala")).toBe(true);
  });
});
