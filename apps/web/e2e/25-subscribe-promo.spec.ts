import { expect, test, type Page } from "@playwright/test";

// A returning visitor with the guide seen, no ad snooze and a fresh app-open stamp (no app-open ad).
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3000",
        localStorage: [
          { name: "sala:how-to-seen:v1", value: "1" },
          { name: "sala.ads.firstSeenAt", value: "1" },
          { name: "sala.ads.lastAppOpenAt", value: String(Date.now()) },
        ],
      },
    ],
  },
});

async function setup(page: Page, patch: Record<string, unknown>) {
  await page.clock.install();
  await page.route("**/api/v1/me", async (route) => {
    const response = await route.fetch();
    route.fulfill({ response, json: { ...(await response.json()), ...patch } });
  });
  await page.goto("/");
  await expect(page.locator('g[role="button"][aria-label*="asiento"]').first()).toBeVisible();
  // Patched after load (React derives its internal keys from Math.random): every roll now passes the chance.
  await page.evaluate(() => {
    Math.random = () => 0;
  });
}

test("a free user eventually sees the Pro promo and can dismiss it", async ({ page }) => {
  await setup(page, { subscriptionsEnabled: true, adFree: false });
  await page.clock.runFor(160_000);

  const card = page.getByRole("complementary", { name: "Suscripción Pro" });
  await expect(card.getByText("Pasate a Pro")).toBeVisible();
  await expect(card.getByRole("link", { name: "Ver Pro" })).toHaveAttribute("href", "/suscripcion");
  await card.getByRole("button", { name: "Ahora no" }).click();
  await expect(card).toHaveCount(0);
});

test("on mobile the promo waits until the donation sheet is closed", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page, { subscriptionsEnabled: true, adFree: false });
  // A day-old visitor gets the donation sheet a few seconds after load.
  await page.clock.runFor(5_000);
  const donate = page.getByRole("dialog", { name: "¿Querés donar?" });
  await expect(donate).toBeVisible();

  const card = page.getByRole("complementary", { name: "Suscripción Pro" });
  await page.clock.runFor(160_000);
  await expect(card).toHaveCount(0);

  await donate.getByRole("button", { name: "Ahora no" }).click();
  await expect(donate).toHaveCount(0);
  await page.clock.runFor(160_000);
  await expect(card.getByText("Pasate a Pro")).toBeVisible();
  await expect(donate).toHaveCount(0);
});

test("a subscriber never sees the promo", async ({ page }) => {
  await setup(page, { subscriptionsEnabled: true, adFree: true });
  await page.clock.fastForward(400_000);
  await expect(page.getByRole("complementary", { name: "Suscripción Pro" })).toHaveCount(0);
});
