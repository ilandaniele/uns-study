import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { ModerationActionType } from "@sala/contracts";
import type { RestrictionType } from "../users/restriction.service.js";
import { CheckInService } from "../checkins/checkins.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";

export interface ApplyActionInput {
  actorId: string;
  targetUserId: string;
  type: ModerationActionType;
  reason: string;
  until?: string | null;
  reportId?: string;
  /** With LIFT: lift only this restriction of the target user. */
  restrictionId?: string;
}

const RESTRICTION_TYPE_BY_ACTION: Partial<Record<ModerationActionType, RestrictionType>> = {
  MUTE_CHAT: "MUTE_CHAT",
  RESTRICT_OBSERVATIONS: "RESTRICT_OBSERVATIONS",
  SUSPEND: "SUSPENDED",
  BAN: "BANNED",
};

/** Applies moderation decisions: writes `user_restrictions` + an append-only `moderation_actions` audit row. */
export class ModerationActionService {
  constructor(
    private readonly db: Db,
    private readonly checkIns: CheckInService,
    private readonly realtime: RoomRealtimeGateway,
  ) {}

  async apply(input: ApplyActionInput): Promise<void> {
    const revokesAccess = input.type === "SUSPEND" || input.type === "BAN";

    // Restriction, audit row and session revocation land together; sockets and the check-in follow once they are durable.
    this.db.transaction((tx) => {
      if (input.type === "LIFT") {
        const now = new Date();
        tx.update(schema.userRestrictions)
          .set({ liftedAt: now })
          .where(
            and(
              eq(schema.userRestrictions.userId, input.targetUserId),
              isNull(schema.userRestrictions.liftedAt),
              input.restrictionId ? eq(schema.userRestrictions.id, input.restrictionId) : undefined,
            ),
          )
          .run();
      } else {
        const restrictionType = RESTRICTION_TYPE_BY_ACTION[input.type];
        if (restrictionType) {
          tx.insert(schema.userRestrictions)
            .values({
              userId: input.targetUserId,
              type: restrictionType,
              reason: input.reason,
              until: input.until ? new Date(input.until) : null,
              createdBy: input.actorId,
            })
            .run();
        }
      }

      tx.insert(schema.moderationActions)
        .values({
          actorId: input.actorId,
          targetUserId: input.targetUserId,
          reportId: input.reportId ?? null,
          action: input.type,
          metadata: { reason: input.reason, until: input.until ?? null, ...(input.restrictionId ? { restrictionId: input.restrictionId } : {}) },
        })
        .run();

      if (revokesAccess) tx.delete(schema.session).where(eq(schema.session.userId, input.targetUserId)).run();
    });

    if (revokesAccess) {
      this.realtime.disconnectUser(input.targetUserId);

      const result = await this.checkIns.checkOut(input.targetUserId);
      if (result) await this.realtime.broadcastSeatChanges(result.roomId, result.changes);
    }
  }
}
