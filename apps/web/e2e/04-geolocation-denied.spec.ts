import { expect, test } from "@playwright/test";
import { ROOM_SLUG, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "3", seatNumber: 1 };

test("checking in without geolocation permission shows the location-needed message", async ({ browser }) => {
  // No `permissions: ['geolocation']` granted, so the browser denies the request.
  const context = await browser.newContext();

  try {
    await signUpNewUser(context);
    const page = await context.newPage();
    await page.goto(`/sala/${ROOM_SLUG}`);

    const seat = seatLocator(page, SEAT.table, SEAT.seatNumber);
    await seat.click();
    await page.getByRole("button", { name: "Estoy acá" }).click();

    await expect(
      page.getByText("Necesitamos tu ubicación sólo para comprobar que estás cerca de la sala."),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
