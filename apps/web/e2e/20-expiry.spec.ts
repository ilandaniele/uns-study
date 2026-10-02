import { expect, test } from "@playwright/test";
import { API_URL, IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, getMyUserId, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "9", seatNumber: 1 };

test("an expired check-in returns the seat to its derived (no data) state, live and after reload", async ({ browser, request }) => {
  const contextA = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextB = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    const userId = await signUpNewUser(contextA).then(() => getMyUserId(contextA));
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);

    await seatLocator(pageA, SEAT.table, SEAT.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    const seatOnB = seatLocator(pageB, SEAT.table, SEAT.seatNumber);
    await expect(seatOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });

    // Age the check-in and run the sweep (only exists when the API runs with E2E_TEST_HOOKS=true).
    const res = await request.post(`${API_URL}/api/v1/__e2e/expire-checkin`, { data: { userId } });
    test.skip(res.status() === 404, "API not running with E2E_TEST_HOOKS=true");
    expect(res.ok()).toBe(true);
    expect((await res.json()).expired).toBe(true);

    // B sees it free up via realtime; there was no other evidence, so it is not occupied/free.
    await expect(seatOnB).not.toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await expect(seatOnB).toHaveAttribute("aria-label", /sin datos/i);

    // A's "Me voy" bar goes away, and a reload agrees with the canonical state.
    await pageA.reload();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toHaveCount(0);
    await expect(seatLocator(pageA, SEAT.table, SEAT.seatNumber)).toHaveAttribute("aria-label", /sin datos/i);
  } finally {
    await checkoutCurrent(contextA);
    await contextA.close();
    await contextB.close();
  }
});
