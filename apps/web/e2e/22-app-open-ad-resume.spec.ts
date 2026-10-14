import { expect, test } from "@playwright/test";

// A returning visitor (seen before, no ad snooze) so the app-open house ad shows on the first load.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3000",
        localStorage: [
          { name: "sala:how-to-seen:v1", value: "1" },
          { name: "sala.ads.firstSeenAt", value: "1" },
        ],
      },
    ],
  },
});

test("following the app-open ad's CTA and going back brings the ad back with its countdown", async ({ page }) => {
  test.setTimeout(60_000);
  // Locally there is no Mercado Pago token, so the ad would promote the home-screen install instead
  // of the subscription; flag subscriptions on so the ad carries its CTA.
  await page.route("**/api/v1/me", async (route) => {
    const response = await route.fetch();
    route.fulfill({ response, json: { ...(await response.json()), subscriptionsEnabled: true } });
  });
  // The main room lives at "/" (/sala/principal redirects there).
  await page.goto("/");

  const ad = page.getByRole("dialog", { name: "Publicidad" });
  await expect(ad).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();

  await ad.getByRole("link", { name: "Quiero sacar los anuncios" }).click();
  await expect(page).toHaveURL(/\/suscripcion/);
  await expect(ad).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(ad).toBeVisible();
  // The countdown resumes where it was left, so the X is not there yet.
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(ad.getByRole("button", { name: "Cerrar anuncio" })).toHaveCount(0);

  await ad.getByRole("button", { name: "Cerrar anuncio" }).click({ timeout: 12_000 });
  await expect(ad).toHaveCount(0);

  // Closed with the X: it does not come back on another visit to the page.
  await page.reload();
  await expect(page.locator('g[role="button"][aria-label*="asiento"]').first()).toBeVisible();
  await expect(ad).toHaveCount(0);
});
