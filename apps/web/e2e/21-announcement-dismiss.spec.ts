import { expect, test } from "@playwright/test";
import { ROOM_SLUG } from "./helpers";

const ANNOUNCEMENT = {
  id: "00000000-0000-4000-8000-0000000000a1",
  roomId: null,
  title: "Horario especial",
  body: "La sala cierra a las 18 el viernes.",
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  endsAt: null,
  active: true,
};

test("an announcement on the room map can be closed with its X and stays closed after reload", async ({ page }) => {
  // Creating a real announcement needs an admin account; the banner only reads this endpoint.
  await page.route(`**/api/v1/rooms/${ROOM_SLUG}/announcements`, (route) => route.fulfill({ json: [ANNOUNCEMENT] }));

  await page.goto(`/sala/${ROOM_SLUG}`);
  await expect(page.getByText(ANNOUNCEMENT.title)).toBeVisible();

  await page.getByRole("button", { name: `Cerrar novedad: ${ANNOUNCEMENT.title}` }).click();
  await expect(page.getByText(ANNOUNCEMENT.title)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('g[role="button"][aria-label*="asiento"]').first()).toBeVisible();
  await expect(page.getByText(ANNOUNCEMENT.title)).toHaveCount(0);
});
