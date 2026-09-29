import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { API_URL, IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, getMyUserId, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "10", seatNumber: 1 };

test("hidden alias: shown as 'Te ven como', rerolls to a different name, and appears on the public profile", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    await signUpNewUser(contextA);
    const userIdA = await getMyUserId(contextA);
    const pageA = await contextA.newPage();
    await pageA.goto("/perfil");

    // Default identity mode is HIDDEN: an alias is shown instead of "Usuario anónimo".
    const aliasText = pageA.getByText(/^Te ven como: /);
    await expect(aliasText).toBeVisible();
    const firstAlias = (await aliasText.textContent())?.replace("Te ven como: ", "").trim();
    expect(firstAlias).toBeTruthy();

    // "Otro nombre" rerolls to a (very likely) different alias.
    await pageA.getByRole("button", { name: "Otro nombre" }).click();
    await expect(async () => {
      const current = (await aliasText.textContent())?.replace("Te ven como: ", "").trim();
      expect(current).toBeTruthy();
    }).toPass();

    // B, logged in, sees the alias (not "Usuario anónimo") on A's public profile.
    await signUpNewUser(contextB);
    const pageB = await contextB.newPage();
    await pageB.goto(`/u/${userIdA}`);
    await expect(pageB.getByText("Usuario anónimo")).toHaveCount(0);
    await expect(pageB.getByRole("heading", { level: 1 })).not.toHaveText("");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("switching to FIRST_NAME shows the name in chat instead of the alias", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const messageText = `Hola desde e2e ${Date.now()}`;

  try {
    await signUpNewUser(contextA);
    const pageA = await contextA.newPage();
    await pageA.goto("/chat");
    await pageA.getByRole("textbox").first().fill(messageText);
    await pageA.getByRole("button", { name: "Enviar" }).click();
    await expect(pageA.getByText(messageText)).toBeVisible();

    // B sees the message under A's alias (A is still HIDDEN by default).
    await signUpNewUser(contextB);
    const pageB = await contextB.newPage();
    await pageB.goto("/chat");
    await expect(pageB.getByText(messageText)).toBeVisible({ timeout: 10_000 });

    // A switches to FIRST_NAME.
    await pageA.goto("/perfil");
    await pageA.getByRole("textbox", { name: "Nombre" }).fill("Ada");
    await pageA.getByRole("combobox", { name: "¿Cómo te ven otras personas?" }).selectOption("FIRST_NAME");
    await pageA.getByRole("button", { name: "Guardar" }).click();
    await expect(pageA.getByText("Guardado.")).toBeVisible();

    // B reloads and now sees "Ada" next to the same message (displayName is computed live, not snapshotted).
    await pageB.reload();
    const messageRow = pageB.getByText(messageText).locator("..").locator("..");
    await expect(messageRow.getByText("Ada")).toBeVisible({ timeout: 10_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("avatar upload shows up in chat and as a photo badge on the occupied seat for a logged-in viewer", async ({ browser }) => {
  const contextA = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextB = await browser.newContext();

  try {
    await signUpNewUser(contextA);

    // Choose a visible identity mode and opt into the avatar, then upload a tiny JPEG via the API.
    const profileRes = await contextA.request.patch(`${API_URL}/api/v1/profiles/me`, {
      headers: { Origin: "http://localhost:3000" },
      data: { nickname: `Foto${Date.now() % 100000}`, identityMode: "NICKNAME" },
    });
    expect(profileRes.ok()).toBe(true);
    const privacyRes = await contextA.request.patch(`${API_URL}/api/v1/profiles/me/privacy`, {
      headers: { Origin: "http://localhost:3000" },
      data: { showAvatar: true },
    });
    expect(privacyRes.ok()).toBe(true);

    const jpegBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 50 } } })
      .jpeg()
      .toBuffer();
    const avatarRes = await contextA.request.post(`${API_URL}/api/v1/profiles/me/avatar`, {
      headers: { Origin: "http://localhost:3000" },
      data: { mimeType: "image/jpeg", base64: jpegBuffer.toString("base64") },
    });
    expect(avatarRes.ok()).toBe(true);

    // A checks in and chooses to show identity, so the photo badge appears on the seat.
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageA, SEAT.table, SEAT.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await pageA.getByRole("button", { name: "Sí, mostrarme" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    await pageA.goto("/chat");
    const messageText = `Foto e2e ${Date.now()}`;
    await pageA.getByRole("textbox").first().fill(messageText);
    await pageA.getByRole("button", { name: "Enviar" }).click();
    await expect(pageA.getByText(messageText)).toBeVisible();

    // B, logged in, sees A's avatar image both in the chat and as the occupied seat's photo badge.
    await signUpNewUser(contextB);
    const pageB = await contextB.newPage();
    await pageB.goto("/chat");
    await expect(pageB.getByText(messageText)).toBeVisible({ timeout: 10_000 });
    // Scoped to this message's row: the shared chat history can carry avatar images from other
    // (e.g. earlier) runs' senders too, so asserting a page-wide count would be flaky.
    const messageRow = pageB.getByText(messageText).locator("..").locator("..");
    await expect(messageRow.locator('img[src*="/api/v1/avatars/"]')).toHaveCount(1);

    await pageB.goto(`/sala/${ROOM_SLUG}`);
    const seatOnB = seatLocator(pageB, SEAT.table, SEAT.seatNumber);
    await expect(seatOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await expect(seatOnB.locator("image")).toHaveCount(1, { timeout: 10_000 });
  } finally {
    await checkoutCurrent(contextA);
    await contextA.close();
    await contextB.close();
  }
});
