import { expect, test } from "@playwright/test";

// A brand-new visitor: nothing in storage, so the guide opens on its own and no ad is snoozed.
test.use({ storageState: { cookies: [], origins: [] } });

test("a first-time visitor gets the guide first and the app-open ad once the guide is closed", async ({ page }) => {
  await page.goto("/");

  const guide = page.getByRole("dialog", { name: /cómo usar/i });
  const ad = page.getByRole("dialog", { name: "Publicidad" });
  await expect(guide).toBeVisible();
  await expect(ad).toHaveCount(0);

  await guide.getByRole("button", { name: "Entendido" }).click();
  await expect(guide).toHaveCount(0);
  await expect(ad).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
});
