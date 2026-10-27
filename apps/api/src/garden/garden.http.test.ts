import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GardenDto, GardenShopDto } from "@sala/contracts";
import { env } from "../env.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import type { MpPreferenceBody } from "../subscriptions/mercadopago.client.js";

describe("garden HTTP", () => {
  const priorToken = env.mpAccessToken;
  const priorSecret = env.mpWebhookSecret;
  const syntheticSecret = "synthetic-garden-webhook-secret";
  let ctx: ReturnType<typeof buildTestApp>;
  let cookie: string;
  let otherCookie: string;
  let preference: MpPreferenceBody;
  function call(
    method: string,
    path: string,
    session?: string,
    body?: unknown,
    origin?: string,
  ) {
    return ctx.app.request(`/api/v1${path}`, {
      method,
      headers: baseHeaders({
        ...(session ? { cookie: session } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(origin ? { origin } : {}),
      }),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  beforeAll(async () => {
    env.mpAccessToken = "synthetic-garden-token";
    env.mpWebhookSecret = syntheticSecret;
    ctx = buildTestApp();
    for (const name of ["garden-test", "garden-other"]) {
      const res = await ctx.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: baseHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          email: `${name}@example.test`,
          password: "correct-horse-battery",
          name,
        }),
      });
      expect(res.status).toBe(200);
      const value = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      if (name === "garden-test") cookie = value;
      else otherCookie = value;
    }
    vi.spyOn(ctx.services.mercadoPago!, "createPreference").mockImplementation(
      async (body) => {
        preference = body;
        return {
          id: "pref-synthetic",
          init_point: "https://www.mercadopago.com.ar/checkout/test",
        };
      },
    );
    vi.spyOn(ctx.services.mercadoPago!, "getPayment").mockImplementation(
      async () => ({
        id: "555",
        external_reference: preference.external_reference!,
        status: "approved",
        currency_id: "ARS",
        transaction_amount: 5000,
      }),
    );
  });
  afterAll(() => {
    env.mpAccessToken = priorToken;
    env.mpWebhookSecret = priorSecret;
  });
  it("requires a session for visits, always shows gardens, and keeps the legacy endpoint safe for older tabs", async () => {
    const meResponse = await call("GET", "/me", cookie);
    const me = await meResponse.json() as { user: { id: string } };
    const path = `/profiles/${me.user.id}/garden`;
    expect((await call("GET", path)).status).toBe(401);
    expect((await call("GET", path, otherCookie)).status).toBe(200);
    expect((await call("POST", "/me/garden/visibility", cookie, { shared: "yes" })).status).toBe(400);
    expect((await call("POST", "/me/garden/visibility", cookie, { shared: true }, "https://outside.example")).status).toBe(403);
    expect((await call("POST", "/me/garden/visibility", cookie, { shared: true })).status).toBe(200);
    const shared = await call("GET", path, otherCookie);
    expect(shared.status).toBe(200);
    expect(shared.headers.get("cache-control")).toBe("private, no-store");
    expect(Object.keys(await shared.json()).sort()).toEqual(["collection", "plants"]);
    await call("POST", "/me/garden/visibility", cookie, { shared: false });
    expect((await call("GET", path, otherCookie)).status).toBe(200);
    const ownGarden = await call("GET", "/me/garden", cookie);
    expect(await ownGarden.json()).toMatchObject({ shared: true });
  });
  it("requires auth for every read and write, and rejects cross-origin writes", async () => {
    for (const [method, path, body] of [
      ["GET", "/me/garden", undefined],
      ["GET", "/me/garden/shop", undefined],
      ["POST", "/me/garden/plant", { plot: 0, speciesId: "ceibo" }],
      ["POST", "/me/garden/redeem", {}],
      ["POST", "/me/garden/checkout", {}],
    ] as const) {
      expect((await call(method, path, undefined, body)).status).toBe(401);
    }
    expect(
      (
        await call(
          "POST",
          "/me/garden/plant",
          cookie,
          { plot: 0, speciesId: "ceibo" },
          "https://outside.example",
        )
      ).status,
    ).toBe(403);
  });
  it("validates species, plots, redeems and financial terms before domain writes", async () => {
    for (const body of [
      { plot: -1, speciesId: "ceibo" },
      { plot: 25, speciesId: "ceibo" },
      { plot: 1.1, speciesId: "ceibo" },
      { plot: 0, speciesId: "invented" },
      { plot: 0, speciesId: "ceibo", seeds: 1000 },
    ])
      expect(
        (await call("POST", "/me/garden/plant", cookie, body)).status,
      ).toBe(400);
    expect(
      (
        await call("POST", "/me/garden/redeem", cookie, {
          plot: 0,
          plantId: "invalid",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("POST", "/me/garden/checkout", cookie, {
          priceArs: 1,
          seeds: 1000,
        })
      ).status,
    ).toBe(400);
  });
  it("allows free accounts to plant, keeps owners isolated and ignores forged payment redirects", async () => {
    const initial = await call(
      "GET",
      "/me/garden?compra=approved&payment_id=555",
      cookie,
    );
    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toBe("private, no-store");
    expect(((await initial.json()) as GardenDto).seeds).toBe(30);
    const planted = await call("POST", "/me/garden/plant", cookie, {
      plot: 0,
      speciesId: "espinillo",
    });
    expect(planted.status).toBe(201);
    const data = (await planted.json()) as GardenDto;
    expect(data.seeds).toBe(18);
    expect(
      (
        (await (
          await call("GET", "/me/garden", otherCookie)
        ).json()) as GardenDto
      ).plants,
    ).toEqual([]);
    expect(
      (
        await call("POST", "/me/garden/redeem", otherCookie, {
          plot: 0,
          plantId: data.plants[0].id,
        })
      ).status,
    ).toBe(404);
  });
  it("verifies signed payment webhooks, credits only the owner once and preserves other payment flows", async () => {
    expect((await call("POST", "/me/garden/checkout", cookie, {})).status).toBe(
      200,
    );
    expect(
      (
        await call("POST", "/webhooks/mercadopago", undefined, {
          type: "payment",
          data: { id: "555" },
        })
      ).status,
    ).toBe(401);
    const ts = String(Date.now());
    const requestId = "synthetic-request";
    const signature = createHmac("sha256", syntheticSecret)
      .update(`id:555;request-id:${requestId};ts:${ts};`)
      .digest("hex");
    for (let i = 0; i < 2; i++) {
      const res = await ctx.app.request(
        "/api/v1/webhooks/mercadopago?data.id=555&type=payment",
        {
          method: "POST",
          headers: {
            "x-signature": `ts=${ts},v1=${signature}`,
            "x-request-id": requestId,
          },
        },
      );
      expect(res.status).toBe(200);
    }
    expect(
      ((await (await call("GET", "/me/garden", cookie)).json()) as GardenDto)
        .seeds,
    ).toBe(118);
    expect(
      (
        (await (
          await call("GET", "/me/garden", otherCookie)
        ).json()) as GardenDto
      ).seeds,
    ).toBe(30);
    const shop = (await (
      await call("GET", "/me/garden/shop", cookie)
    ).json()) as GardenShopDto;
    expect(shop.pack).toEqual({ seeds: 100, priceArs: 5000 });
    expect(shop.orders[0].creditedSeeds).toBe(100);
    const sub = vi
      .spyOn(ctx.services.subscriptions, "handleWebhook")
      .mockResolvedValue();
    const res = await ctx.app.request(
      "/api/v1/webhooks/mercadopago?data.id=555&type=subscription_preapproval",
      {
        method: "POST",
        headers: {
          "x-signature": `ts=${ts},v1=${signature}`,
          "x-request-id": requestId,
        },
      },
    );
    expect(res.status).toBe(200);
    expect(sub).toHaveBeenCalledWith({
      type: "subscription_preapproval",
      dataId: "555",
    });
  });
});
