import { describe, expect, it, vi } from "vitest";
import { composeVerificationEmail, createVerificationEmailSender } from "./verification-email.js";

describe("verification email", () => {
  it("composes text and html with the link and escapes the name", () => {
    const msg = composeVerificationEmail({ from: "Sala <x@y.z>", to: "u@e.com", name: "<b>Ana</b>", url: "https://api.test/verify?token=a&x=1" });
    expect(msg.to).toEqual(["u@e.com"]);
    expect(msg.text).toContain("https://api.test/verify?token=a&x=1");
    expect(msg.html).toContain("token=a&amp;x=1");
    expect(msg.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(msg.html).not.toContain("<b>Ana");
  });

  it("is disabled without a client or sender address", () => {
    expect(createVerificationEmailSender(null, { from: "x@y.z" })).toBeNull();
    expect(createVerificationEmailSender({ sendBatch: vi.fn() }, { from: "" })).toBeNull();
  });

  it("sends one message without awaiting, and swallows send errors", async () => {
    const sendBatch = vi.fn().mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = createVerificationEmailSender({ sendBatch }, { from: "x@y.z" })!;
    await expect(send({ user: { email: "u@e.com", name: "Ana" }, url: "https://api.test/v", token: "t" })).resolves.toBeUndefined();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0]![0]).toHaveLength(1);
    await new Promise((r) => setImmediate(r));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
