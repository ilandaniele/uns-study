import { describe, expect, it } from "vitest";
import { emailCampaignInputSchema } from "@sala/contracts";
import { parseAudienceQuery } from "./admin-email.router.js";

describe("email audience validation", () => {
  it("defaults the recipient count query to all", () => {
    expect(parseAudienceQuery(undefined)).toBe("all");
    expect(parseAudienceQuery("subscribers")).toBe("subscribers");
  });

  it("rejects an unknown audience", () => {
    expect(() => parseAudienceQuery("everyone")).toThrow();
    expect(emailCampaignInputSchema.safeParse({ subject: "a", bodyText: "b", audience: "vip" }).success).toBe(false);
  });

  it("defaults a new campaign to all", () => {
    expect(emailCampaignInputSchema.parse({ subject: "a", bodyText: "b" }).audience).toBe("all");
  });
});
