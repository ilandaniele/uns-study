import { expect, test } from "@playwright/test";
import { API_URL, signUpNewUser } from "./helpers";

test("global room chat: realtime delivery, then blocking hides the blocked author's new messages", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    await signUpNewUser(contextA);
    await signUpNewUser(contextB);

    // New users default to a hidden alias (no userId in chat, so no "Bloquear"); make A visible.
    const profileRes = await contextA.request.patch(`${API_URL}/api/v1/profiles/me`, {
      headers: { Origin: "http://localhost:3000" },
      data: { nickname: `Chat${Date.now() % 100000}`, identityMode: "NICKNAME" },
    });
    expect(profileRes.ok()).toBe(true);

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await pageA.goto("/chat");
    await pageB.goto("/chat");

    const firstMessage = `hola-${Date.now()}`;
    await pageA.getByPlaceholder("Escribí un mensaje…").fill(firstMessage);
    await pageA.getByPlaceholder("Escribí un mensaje…").press("Enter");

    // B sees it without reloading.
    await expect(pageB.getByText(firstMessage)).toBeVisible({ timeout: 10_000 });

    // B blocks A via the message's "..." menu.
    const messageRow = pageB.locator(".group", { hasText: firstMessage });
    await messageRow.getByRole("button", { name: "Más opciones" }).click();
    await pageB.getByRole("button", { name: "Bloquear" }).click();

    // A sends a new message; B must not see it (client-side block filtering), even in realtime.
    const secondMessage = `chau-${Date.now()}`;
    await pageA.getByPlaceholder("Escribí un mensaje…").fill(secondMessage);
    await pageA.getByPlaceholder("Escribí un mensaje…").press("Enter");
    await expect(pageA.getByText(secondMessage)).toBeVisible();

    await pageB.waitForTimeout(1500);
    await expect(pageB.getByText(secondMessage)).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
