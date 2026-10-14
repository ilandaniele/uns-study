import { expect, test, type Page } from "@playwright/test";

async function mockMe(page: Page, adFree: boolean) {
  await page.route("**/api/v1/me", async (route) => {
    const response = await route.fetch();
    route.fulfill({ response, json: { ...(await response.json()), subscriptionsEnabled: true, adFree } });
  });
}

test("a free user sees PRO on Foco extras and gets the upsell when clicking one", async ({ page }) => {
  await mockMe(page, false);
  await page.goto("/foco");

  const fullscreen = page.getByRole("button", { name: /Pantalla completa.*Pro/ });
  await expect(fullscreen).toBeVisible();
  await fullscreen.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Desbloqueá/ })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Hacerme Pro" })).toHaveAttribute("href", "/suscripcion");

  await dialog.getByRole("button", { name: "Ahora no" }).click();
  await expect(dialog).toHaveCount(0);
});

test("a Pro user sees no locks and no upsell", async ({ page }) => {
  await mockMe(page, true);
  await page.goto("/foco");

  const fullscreen = page.getByRole("button", { name: "Pantalla completa", exact: true });
  await expect(fullscreen).toBeVisible();
  await expect(page.getByRole("button", { name: /\(Pro\)/ })).toHaveCount(0);
  await fullscreen.click();
  await expect(page.getByRole("heading", { name: /Desbloqueá/ })).toHaveCount(0);
});
