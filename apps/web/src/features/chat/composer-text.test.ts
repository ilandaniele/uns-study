import { describe, expect, it } from "vitest";
import { insertComposerEmoji } from "./composer-text";

describe("composer emoji insertion", () => {
  it("inserts at the caret and replaces a selected range", () => {
    expect(insertComposerEmoji("Hola mundo", "❤️", 5, 10, 500)).toEqual({ value: "Hola ❤️", caret: 7 });
    expect(insertComposerEmoji("Hola!", "👍", 4, 4, 500)).toEqual({ value: "Hola👍!", caret: 6 });
  });
  it("rejects an emoji that does not fit without losing the draft or creating broken surrogates", () => {
    expect(insertComposerEmoji("1234", "👍", 4, 4, 5)).toEqual({ value: "1234", caret: 4 });
    expect(insertComposerEmoji("1234", "👍", 4, 4, 6)).toEqual({ value: "1234👍", caret: 6 });
  });
});
