import { expect, test } from "@playwright/test";
import type { RoomMapDto } from "@sala/contracts";

// All writes and identities are fixtures. This exercises the real room UI without sending
// observations, accounts or challenge tokens to a live API/Cloudflare.
test("seat verification recovers from rejection, expiration and widget errors", async ({ page, context, request }) => {
  const response = await request.get("/api/v1/rooms/principal/map");
  const map = await response.json() as RoomMapDto;
  const seat = map.seats[0]!;
  map.seats = map.seats.map((s) => ({ ...s, status: "UNKNOWN", occupiedUntil: null, dispute: null, verified: false }));
  map.room.operatingHours = { open: true, opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString() };
  const me = { user: { id: "captcha-fixture", name: "Prueba", email: "captcha@example.invalid", image: null }, activeCheckIn: null, roles: [], restrictions: [], pro: false, profileCompleted: true, adFree: true };
  await context.addInitScript((roomId) => {
    delete (Object.getPrototypeOf(navigator) as Record<string, unknown>).serviceWorker;
    localStorage.setItem("sala:presence-grant:" + roomId, String(Date.now() + 3_600_000));
    localStorage.setItem("sala:how-to-seen:v1", "1");
    localStorage.setItem("sala:identity-prompt-seen:v1:captcha-fixture", "1");
    localStorage.setItem("sala.ads.snoozedUntil", "32503680000000");
  }, map.room.id);
  await context.routeWebSocket("**/api/v1/realtime/ws*", (ws) => ws.onMessage((raw) => {
    const message = JSON.parse(String(raw));
    if (message.id) ws.send(JSON.stringify({ ack: message.id, d: { ok: true } }));
  }));
  await context.route("**/api/auth/**", (route) => route.fulfill({ json: { user: me.user, session: { id: "fixture" } } }));
  const tokens: Array<string | undefined> = [];
  let accept = false;
  await context.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/observations")) {
      const body = route.request().postDataJSON();
      tokens.push(body.turnstileToken);
      if (!accept || !body.turnstileToken) return route.fulfill({ status: 403, json: { error: { code: "TURNSTILE_REQUIRED", message: "Verificación necesaria" } } });
      const event = { roomId: map.room.id, seatId: seat.id, status: body.status, confidence: "HIGH", verified: false, occupiedUntil: null, lastUpdatedAt: new Date().toISOString() };
      return route.fulfill({ status: 201, json: { ok: true, seats: [event], dispute: null } });
    }
    let data: unknown = [];
    if (path === "/api/v1/me") data = me;
    else if (path.endsWith("/map")) data = map;
    else if (path.endsWith("/messages")) data = { chatRoomId: "fixture-chat", items: [], nextCursor: null };
    else if (path.endsWith("/stats/today")) data = { visitorsToday: 0, myContributionsToday: 0 };
    else if (path.endsWith("/realtime/token")) data = { token: "fixture" };
    else if (path.endsWith("/presence/grant")) data = { expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    await route.fulfill({ json: data });
  });
  await context.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `let nextWidget = 0; window.turnstile = {
      render(container, options) {
        const id = String(++nextWidget);
        container.dataset.widget = id;
        container.innerHTML = '';
        for (const [name, fn] of [
          ['Resolver prueba', () => { options.callback('token-' + id); options.callback('token-' + id); }],
          ['Simular vencimiento', options['expired-callback']],
          ['Simular error', options['error-callback']],
          ['Simular timeout', options['timeout-callback']]
        ]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = name; button.onclick = fn; container.append(button); }
        return id;
      },
      remove(id) { const container = document.querySelector('[data-widget="' + id + '"]'); if (container) container.innerHTML = ''; }
    };`,
  }));

  await page.goto("/sala/principal");
  const target = page.locator('g[role="button"][aria-label*="asiento"]').first();
  await expect(target).toBeVisible();
  await target.click();
  await page.getByRole("button", { name: "Está ocupado", exact: true }).click();
  await page.getByRole("button", { name: "Resolver prueba", exact: true }).click();
  await expect(page.getByRole("button", { name: "Volver a verificar", exact: true })).toBeVisible();
  expect(tokens).toEqual([undefined, "token-1"]); // duplicate callback did not double-submit
  for (const failure of ["Simular vencimiento", "Simular error", "Simular timeout"]) {
    await page.getByRole("button", { name: "Volver a verificar", exact: true }).click();
    await page.getByRole("button", { name: failure, exact: true }).click();
    await expect(page.getByRole("button", { name: "Volver a verificar", exact: true })).toBeVisible();
  }
  expect(tokens).toHaveLength(2); // expired/error callbacks never replay an old token
  await page.getByRole("button", { name: "Volver a verificar", exact: true }).click();
  accept = true;
  await page.getByRole("button", { name: "Resolver prueba", exact: true }).click();
  await expect(page.getByText("Confirmá que sos una persona para continuar.", { exact: true })).toHaveCount(0);
  await expect(target).toHaveAttribute("aria-label", /ocupado/);
  expect(tokens).toHaveLength(3);
  expect(tokens[2]).not.toBe(tokens[1]);
  await page.getByRole("button", { name: "Está libre", exact: true }).click();
  await page.getByRole("button", { name: "Resolver prueba", exact: true }).click();
  await expect(target).toHaveAttribute("aria-label", /libre/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
