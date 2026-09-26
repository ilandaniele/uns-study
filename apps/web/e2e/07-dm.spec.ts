import { expect, test } from "@playwright/test";
import { getMyUserId, signUpNewUser } from "./helpers";

test("DM: A opens B's profile, sends a message, B sees it unread in /chat/dm", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    await signUpNewUser(contextA);
    await signUpNewUser(contextB);
    const userIdB = await getMyUserId(contextB);

    const pageA = await contextA.newPage();
    await pageA.goto(`/u/${userIdB}`);
    await pageA.getByRole("button", { name: "Enviar mensaje" }).click();
    await pageA.waitForURL(/\/chat\/dm\/.+/);

    const content = `dm-${Date.now()}`;
    await pageA.getByPlaceholder("Escribí un mensaje…").fill(content);
    await pageA.getByPlaceholder("Escribí un mensaje…").press("Enter");
    await expect(pageA.getByText(content)).toBeVisible();

    const pageB = await contextB.newPage();
    await pageB.goto("/chat/dm");
    // Unread badge visible on the conversation row before opening it.
    await expect(pageB.getByText(content)).toBeVisible({ timeout: 10_000 });
    const unreadBadge = pageB.locator("li", { hasText: content }).getByText(/^\d+$/);
    await expect(unreadBadge).toBeVisible();

    await pageB.getByText(content).click();
    await expect(pageB.getByText(content)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
