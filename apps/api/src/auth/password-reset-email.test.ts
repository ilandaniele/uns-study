import { describe, expect, it, vi } from "vitest";
import { composePasswordResetEmail, createPasswordResetSender, passwordResetLink } from "./password-reset-email.js";

describe("password reset email", () => {
  it("links to the web restablecer page with the encoded token", () => {
    expect(passwordResetLink("https://web.test/", "a b")).toBe("https://web.test/restablecer?token=a%20b");
  });

  it("composes text and html with the link and escapes the name", () => {
    const msg = composePasswordResetEmail({ from: "Sala <x@y.z>", to: "u@e.com", name: "<b>Ana</b>", webUrl: "https://web.test", token: "tok" });
    expect(msg.to).toEqual(["u@e.com"]);
    expect(msg.text).toContain("https://web.test/restablecer?token=tok");
    expect(msg.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(msg.html).not.toContain("<b>Ana");
  });

  it("is disabled without a client or sender address", () => {
    expect(createPasswordResetSender(null, { from: "x@y.z", webUrl: "https://web.test" })).toBeNull();
    expect(createPasswordResetSender({ sendBatch: vi.fn() }, { from: "", webUrl: "https://web.test" })).toBeNull();
  });

  it("sends one message without awaiting, and swallows send errors", async () => {
    const sendBatch = vi.fn().mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = createPasswordResetSender({ sendBatch }, { from: "x@y.z", webUrl: "https://web.test" })!;
    await expect(send({ user: { email: "u@e.com", name: "Ana" }, token: "tok" })).resolves.toBeUndefined();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0]![0]).toHaveLength(1);
    await new Promise((r) => setImmediate(r));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
