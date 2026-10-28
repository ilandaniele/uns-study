import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RankingEntryDto } from "@sala/contracts";
import { RankingTable, rankingProfileHref } from "./RankingTable";

const alias: RankingEntryDto = { userId: null, displayName: "Coipo Ingenioso", aliasAnimal: "coipo", avatarUrl: null, adminBadge: false, rank: 4, isMe: false, value: 90, achievement: { id: "collaboration_10", title: "Mano amiga", tier: "bronze" } };
describe("ranking profile links and earned medals", () => {
  it("links an alias to its pseudonymous profile without inventing or exposing an account id", () => {
    expect(rankingProfileHref(alias)).toBe("/alias/Coipo%20Ingenioso");
    const html = renderToStaticMarkup(<RankingTable ranking={{ period: "week", category: "study_time", entries: [alias], me: null }}/>);
    expect(html).toContain('href="/alias/Coipo%20Ingenioso"');
    expect(html).not.toContain('href="/u/');
    expect(html).toContain("Insignia: Mano amiga");
  });
  it("keeps visible profiles linkable and generic unidentifiable entries unlinked", () => {
    expect(rankingProfileHref({ ...alias, userId: "public-id" })).toBe("/u/public-id");
    expect(rankingProfileHref({ ...alias, displayName: "Usuario anónimo", aliasAnimal: null })).toBeNull();
  });
  it("makes the podium avatar and name link to the same alias profile", () => {
    const html = renderToStaticMarkup(<RankingTable ranking={{ period: "week", category: "study_time", entries: [{ ...alias, rank: 1 }], me: null }}/>);
    expect(html.match(/href="\/alias\/Coipo%20Ingenioso"/g)).toHaveLength(2);
  });
});
