import { describe, expect, it, vi } from "vitest";
import { MercadoPagoClient, MpHttpError } from "./mercadopago.client.js";

describe("MercadoPagoClient transport", () => {
  it("uses the runtime global receiver required by Cloudflare fetch", async () => {
    const transport: typeof fetch = async function (this: unknown, input, init) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      expect(String(input)).toBe("https://api.mercadopago.com/v1/payments/123");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-token");
      return Response.json({ id: 123, status: "approved" });
    };
    const client = new MercadoPagoClient("synthetic-token", transport);
    await expect(client.getPayment("123")).resolves.toMatchObject({ id: 123 });
  });

  it("creates an unpaid preference with server terms and an idempotency key", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      id: "preference-test", init_point: "https://www.mercadopago.com.ar/checkout/test",
    }));
    const client = new MercadoPagoClient("synthetic-token", transport);
    const body = {
      items: [{ title: "Semillas", quantity: 1 as const, unit_price: 5000, currency_id: "ARS" as const }],
      back_urls: { success: "https://example.test", pending: "https://example.test", failure: "https://example.test" },
      auto_return: "approved" as const, statement_descriptor: "SALA ESTUDIO",
    };
    await client.createPreference(body);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual(body);
    expect(new Headers(init?.headers).get("X-Idempotency-Key")).toBeTruthy();
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves provider status without exposing the response body or credentials", async () => {
    const client = new MercadoPagoClient("synthetic-token", async () => new Response(
      "private provider details", { status: 401 },
    ));
    await expect(client.getPayment("123")).rejects.toMatchObject({
      name: "MpHttpError", status: 401,
      message: "Mercado Pago GET /v1/payments/123 failed (401)",
    } satisfies Partial<MpHttpError>);
  });

  it("rejects a redirect without following it with the access token", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { Location: "https://other.example.test" },
    }));
    const client = new MercadoPagoClient("synthetic-token", transport);
    await expect(client.getPayment("123")).rejects.toMatchObject({ status: 302 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });
});
