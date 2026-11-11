import { describe, expect, it, vi } from "vitest";
import { ResendClient, type ResendMessage } from "./resend.client.js";

const message: ResendMessage = {
  from: "Sala <sala@example.test>", to: ["test@example.test"],
  subject: "Prueba sintética", text: "Prueba", html: "<p>Prueba</p>", headers: {},
};

describe("ResendClient transport", () => {
  it("uses the Workers global receiver and returns provider ids without sending real mail", async () => {
    const transport: typeof fetch = async function (this: unknown, input, init) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      expect(String(input)).toBe("https://api.resend.com/emails/batch");
      expect(init?.redirect).toBe("manual");
      expect(JSON.parse(init!.body as string)).toEqual([message]);
      return Response.json({ data: [{ id: "synthetic-message" }] });
    };
    await expect(new ResendClient("synthetic-key", transport).sendBatch([message]))
      .resolves.toEqual(["synthetic-message"]);
  });

  it("rejects redirects instead of forwarding the provider credential", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { Location: "https://other.example.test" },
    }));
    await expect(new ResendClient("synthetic-key", transport).sendBatch([message]))
      .rejects.toMatchObject({ name: "ResendError", status: 302 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
