import { describe, expect, it } from "vitest";
import { instagramHref } from "./instagram";

describe("public Instagram links", () => {
  it("accepts public handles and historical leading @", () => {
    expect(instagramHref(" @ana.estudia_ ")).toBe(
      "https://www.instagram.com/ana.estudia_/",
    );
  });
  it.each([
    "javascript:alert(1)",
    "https://outside.example",
    "user?x=y",
    "../redirect/",
    "",
  ])("does not turn an arbitrary value into a link: %s", (value) => {
    expect(instagramHref(value)).toBeNull();
  });
});
