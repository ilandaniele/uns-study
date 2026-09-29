import { expect, test } from "@playwright/test";
import { API_URL, IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "7", seatNumber: 1 };
const NICKNAME = `E2E-${Date.now()}`;

test("profile identity + privacy: hidden (alias) by default, then visible by name once a visible identity mode is chosen", async ({ browser }) => {
  const contextA = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: IN_GEOFENCE_LOCATION,
  });
  const contextB = await browser.newContext();

  try {
    // B checks /personas before A exists/opts in: A must not appear.
    await signUpNewUser(contextB);
    const pageB = await contextB.newPage();
    await pageB.goto("/personas");
    await expect(pageB.getByText(NICKNAME)).toHaveCount(0);

    // A signs up, fills a nickname but keeps the default HIDDEN mode, and checks in: B must not see the nickname.
    await signUpNewUser(contextA);
    const pageA = await contextA.newPage();
    await pageA.goto("/perfil");
    await pageA.getByRole("textbox", { name: "Apodo" }).fill(NICKNAME);
    await pageA.getByRole("button", { name: "Guardar" }).click();
    await expect(pageA.getByText("Guardado.")).toBeVisible();

    await pageA.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageA, SEAT.table, SEAT.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    await pageB.reload();
    await expect(pageB.getByText(NICKNAME)).toHaveCount(0);

    // A chooses a visible identity mode and shows the name on the current check-in: no privacy toggle involved.
    await pageA.goto("/perfil");
    await pageA.getByRole("combobox", { name: "¿Cómo te ven otras personas?" }).selectOption("NICKNAME");
    await pageA.getByRole("button", { name: "Guardar" }).click();
    await expect(pageA.getByText("Guardado.")).toBeVisible();
    const identityRes = await contextA.request.patch(`${API_URL}/api/v1/checkins/current/identity`, {
      headers: { Origin: "http://localhost:3000" },
      data: { showIdentity: true },
    });
    expect(identityRes.ok()).toBe(true);

    // B reloads /personas and now sees A by nickname.
    await pageB.reload();
    await expect(pageB.getByText(NICKNAME)).toBeVisible({ timeout: 10_000 });
  } finally {
    await checkoutCurrent(contextA);
    await contextA.close();
    await contextB.close();
  }
});
