import { expect, test } from "@playwright/test";
import { ROOM_SLUG, seatLocator } from "./helpers";

test("anonymous visitor sees the room map and is prompted to log in to collaborate", async ({ page }) => {
  await page.goto(`/sala/${ROOM_SLUG}`);

  const seats = page.locator('g[role="button"][aria-label*="asiento"]');
  await expect(seats).toHaveCount(108);

  await expect(page.getByText("lugares en total")).toBeVisible();
  // exact match: the hero sentence ("Quedan N lugares libres") also contains "libres" as a
  // substring, so a loose match would hit two elements once the redesign's hero line was added.
  await expect(page.getByText("Libres", { exact: true })).toBeVisible();
  await expect(page.getByText("Ocupados")).toBeVisible();

  await expect(page.getByText("Reservar")).toHaveCount(0);

  const seat = seatLocator(page, "12", 4);
  await seat.click();

  await expect(page.getByText("Iniciá sesión para colaborar.")).toBeVisible();
});
