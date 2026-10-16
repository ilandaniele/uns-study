import { eq } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { GroupRankingDto, RankingCategory, RankingEntryDto, RankingPeriod } from "@sala/contracts";
import type { GroupStudyService } from "../group-study/group-study.service.js";
import { toRankingEntry, type RankingsService } from "../rankings/rankings.service.js";
import type { RoomsService } from "../rooms/rooms.service.js";

/** Pro "Ranking entre amigos": the room ranking restricted to the members of one group. */
export class GroupRankingService {
  constructor(
    private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly rankings: RankingsService,
    private readonly groupStudy: GroupStudyService,
  ) {}

  /** 404 if no such group / viewer not a member / unknown room. Zero writes. */
  async getGroupRanking(
    groupId: string,
    viewerId: string,
    roomIdOrSlug: string,
    period: RankingPeriod,
    category: RankingCategory,
    nowOverride?: Date,
  ): Promise<GroupRankingDto> {
    // 404 for both "no such group" and "not a member".
    const memberIds = this.groupStudy.memberIdsOf(groupId, viewerId);
    const [group] = this.db
      .select({ name: schema.groupConversations.name })
      .from(schema.groupConversations)
      .where(eq(schema.groupConversations.id, groupId))
      .all();
    const room = await this.rooms.findRoomRow(roomIdOrSlug);
    const values = await this.rankings.rawValues(room, period, category, nowOverride);

    // Members blocked in either direction with the viewer are left out; the viewer always stays a candidate.
    const blocked = this.groupStudy.blockedAmong(viewerId, memberIds);
    const candidates = memberIds.filter((id) => id === viewerId || !blocked.has(id));
    const identities = await this.rankings.identities(candidates);

    const ranked = candidates
      .filter((id) => {
        const info = identities.get(id);
        return Boolean(info?.visible && !info.hiddenFromRanking);
      })
      .map((id) => ({ id, value: values.get(id) ?? 0 }))
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));

    const entries: RankingEntryDto[] = ranked.map(({ id, value }, i) => toRankingEntry(id, identities.get(id)!, i + 1, value, viewerId));
    const me = entries.find((e) => e.isMe) ?? null;

    return { groupId, groupName: group?.name ?? "", roomSlug: room.slug, period, category, entries, me };
  }
}
