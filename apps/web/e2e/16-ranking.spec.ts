import { expect, test } from "@playwright/test";
import { API_URL, IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "11", seatNumber: 1 };

test("ranking page loads, period/category switches work", async ({ page }) => {
  await page.goto("/ranking");
  await expect(page.getByRole("heading", { name: "Ranking" })).toBeVisible();

  await page.getByRole("radio", { name: "Mes" }).click();
  await expect(page.getByRole("radio", { name: "Mes", checked: true })).toBeVisible();
  await page.getByRole("radio", { name: "Histórico" }).click();
  await expect(page.getByRole("radio", { name: "Histórico", checked: true })).toBeVisible();

  await page.getByRole("radio", { name: "Racha" }).click();
  await expect(page.getByRole("radio", { name: "Racha", checked: true })).toBeVisible();
  await page.getByRole("radio", { name: "Colaboración" }).click();
  await expect(page.getByRole("radio", { name: "Colaboración", checked: true })).toBeVisible();
});

test("a hidden user's ranking row shows their alias with no profile link", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    await signUpNewUser(context);

    // A quick check-in (any duration) counts as one "Colaboración" point, no minimum time needed.
    const page = await context.newPage();
    await page.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(page, SEAT.table, SEAT.seatNumber).click();
    await page.getByRole("button", { name: "Estoy acá" }).click();
    await expect(page.getByRole("button", { name: "Me voy" })).toBeVisible();
    await checkoutCurrent(context);

    // Lazily creates the caller's (default HIDDEN, not shown-in-room) profile + alias.
    const meRes = await context.request.get(`${API_URL}/api/v1/profiles/me`, { headers: { Origin: "http://localhost:3000" } });
    expect(meRes.ok()).toBe(true);
    const { alias } = (await meRes.json()) as { alias: string | null };
    expect(alias).toBeTruthy();

    await page.goto("/ranking");
    await page.getByRole("radio", { name: "Colaboración" }).click();
    await page.getByRole("radio", { name: "Histórico" }).click();

    // Not `exact: true`: this is the caller's own row, which also carries a " vos" suffix in the
    // same element.
    const aliasText = page.getByText(alias!);
    await expect(aliasText).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`a:has-text("${alias}")`)).toHaveCount(0);
  } finally {
    await checkoutCurrent(context);
    await context.close();
  }
});
