import { expect, test } from "@playwright/test";
import { API_URL, IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Table/seats reserved for this spec (distinct from other spec files to avoid cross-test collisions).
// A table's nickname, once locked in by 5+ votes, can only be replaced by a *strictly* higher
// vote count (a tie favors the incumbent — see `recomputeNickname`), so this spec must always run
// against a table that has never had a nickname proposal reach the threshold. Table 7's seats
// 2-7 are free for that: seat 1 briefly hosts a check-in in 05-profile-privacy.spec.ts, but
// check-ins don't affect nickname eligibility or state, so this doesn't collide with it. IMPORTANT:
// once this spec has passed once against a given table (in this or any other run against the same
// database), it permanently "uses up" that table for any later run — pick an unused table number
// (check `GET /rooms/:id/map` for a table with no `nickname` yet) rather than re-running this file
// against a table it has already passed on.
const TABLE = "7";
const SEAT_PROPOSER = { table: TABLE, seatNumber: 2 };
const VOTER_SEATS = [3, 4, 5, 6, 7].map((seatNumber) => ({ table: TABLE, seatNumber }));

test("table nickname: eligibility gate, then 5 votes promote a proposal to the map pill", async ({ browser }) => {
  const proposerContext = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const voterContexts = await Promise.all(
    VOTER_SEATS.map(() => browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION })),
  );
  const nickname = `E2E Mesa ${Date.now() % 100000}`;

  try {
    await signUpNewUser(proposerContext);
    const proposerPage = await proposerContext.newPage();
    await proposerPage.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(proposerPage, SEAT_PROPOSER.table, SEAT_PROPOSER.seatNumber).click();

    // Without any check-in yet, proposing is rejected with the eligibility message.
    await proposerPage.getByPlaceholder("Proponé un nombre").fill(nickname);
    await proposerPage.getByRole("button", { name: "Proponer" }).click();
    await expect(proposerPage.getByText("Para proponer o votar tenés que haber marcado un lugar en la sala.")).toBeVisible();

    // The proposer checks in (any check-in makes them eligible), then proposes successfully.
    await proposerPage.getByRole("button", { name: "Estoy acá" }).click();
    await expect(proposerPage.getByRole("button", { name: "Me voy" })).toBeVisible();

    await proposerPage.getByPlaceholder("Proponé un nombre").fill(nickname);
    const [proposeResponse] = await Promise.all([
      proposerPage.waitForResponse((res) => res.url().includes("/names") && res.request().method() === "POST"),
      proposerPage.getByRole("button", { name: "Proponer" }).click(),
    ]);
    const proposal = (await proposeResponse.json()) as { id: string };
    await expect(proposerPage.getByText(nickname).first()).toBeVisible();

    // 5 distinct users each check in (making them eligible), then vote via the API.
    for (let i = 0; i < voterContexts.length; i++) {
      const context = voterContexts[i]!;
      const seat = VOTER_SEATS[i]!;
      await signUpNewUser(context);
      const page = await context.newPage();
      await page.goto(`/sala/${ROOM_SLUG}`);
      await seatLocator(page, seat.table, seat.seatNumber).click();
      await page.getByRole("button", { name: "Estoy acá" }).click();
      await expect(page.getByRole("button", { name: "Me voy" })).toBeVisible();

      const voteRes = await context.request.post(`${API_URL}/api/v1/names/${proposal.id}/vote`, {
        headers: { Origin: "http://localhost:3000" },
      });
      expect(voteRes.ok()).toBe(true);
    }

    // Once it clears the 5-vote threshold, the nickname replaces "Mesa N" on the map pill for everyone.
    await expect(proposerPage.locator("text", { hasText: nickname })).toHaveCount(1, { timeout: 10_000 });
  } finally {
    await checkoutCurrent(proposerContext);
    await Promise.all(voterContexts.map((c) => checkoutCurrent(c)));
    await proposerContext.close();
    await Promise.all(voterContexts.map((c) => c.close()));
  }
});
