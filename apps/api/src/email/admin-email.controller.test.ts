import { describe, expect, it } from "vitest";
import { emailAudienceSchema, emailCampaignInputSchema } from "@sala/contracts";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";

describe("email audience validation", () => {
  const countQuery = new ZodBodyPipe(emailAudienceSchema.default("all"));

  it("defaults the recipient count query to all", () => {
    expect(countQuery.transform(undefined)).toBe("all");
    expect(countQuery.transform("subscribers")).toBe("subscribers");
  });

  it("rejects an unknown audience", () => {
    expect(() => countQuery.transform("everyone")).toThrow();
    expect(() => new ZodBodyPipe(emailCampaignInputSchema).transform({ subject: "a", bodyText: "b", audience: "vip" })).toThrow();
  });

  it("defaults a new campaign to all", () => {
    expect(new ZodBodyPipe(emailCampaignInputSchema).transform({ subject: "a", bodyText: "b" }).audience).toBe("all");
  });
});
