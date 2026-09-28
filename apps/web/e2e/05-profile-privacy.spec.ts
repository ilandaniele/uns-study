import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "7", seatNumber: 1 };
const NICKNAME = `E2E-${Date.now()}`;

test("profile identity + privacy: hidden by default, then visible in /personas once opted in", async ({ browser }) => {
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

    // A signs up, checks in (so they have an active presence signal), then opts into visibility.
    await signUpNewUser(contextA);
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageA, SEAT.table, SEAT.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    await pageA.goto("/perfil");
    await pageA.getByRole("textbox", { name: "Apodo" }).fill(NICKNAME);
    await pageA.getByRole("combobox", { name: "¿Cómo te ven otras personas?" }).selectOption("NICKNAME");
    await pageA.getByRole("button", { name: "Guardar" }).click();
    await expect(pageA.getByText("Guardado.")).toBeVisible();

    const showInRoomSwitch = pageA.getByRole("switch", { name: /Aparecer en/ });
    await Promise.all([
      pageA.waitForResponse((res) => res.url().includes("/api/v1/profiles/me/privacy") && res.request().method() === "PATCH"),
      showInRoomSwitch.click(),
    ]);
    await expect(showInRoomSwitch).toHaveAttribute("aria-checked", "true");

    // B reloads /personas and now sees A by nickname.
    await pageB.reload();
    await expect(pageB.getByText(NICKNAME)).toBeVisible({ timeout: 10_000 });
  } finally {
    await checkoutCurrent(contextA);
    await contextA.close();
    await contextB.close();
  }
});
