import { expect, test } from "@playwright/test";
import { getMyUserId, signUpNewUser } from "./helpers";

// R2 storage isn't configured in the local/dev env (see .env.example), so this also exercises
// the STORAGE_UNAVAILABLE path — reports still succeed without a photo.
test("reporting a user without a photo shows a success message", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    await signUpNewUser(contextA);
    await signUpNewUser(contextB);
    const userIdB = await getMyUserId(contextB);

    const pageA = await contextA.newPage();
    await pageA.goto(`/reportar/${userIdB}?context=PROFILE`);

    await pageA.getByLabel("Descripción").fill("Comportamiento inapropiado en el chat.");
    await pageA.getByRole("button", { name: "Enviar reporte" }).click();

    await expect(pageA.getByText("Reporte enviado.")).toBeVisible({ timeout: 10_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
