import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { ModerationActionType } from "@uns/contracts";
import { DB } from "../database/database.module.js";
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
}

const RESTRICTION_TYPE_BY_ACTION: Partial<Record<ModerationActionType, RestrictionType>> = {
  MUTE_CHAT: "MUTE_CHAT",
  RESTRICT_OBSERVATIONS: "RESTRICT_OBSERVATIONS",
  SUSPEND: "SUSPENDED",
  BAN: "BANNED",
};

/** Applies moderation decisions: writes `user_restrictions` + an append-only `moderation_actions` audit row. */
@Injectable()
export class ModerationActionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CheckInService) private readonly checkIns: CheckInService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
  ) {}

  async apply(input: ApplyActionInput): Promise<void> {
    if (input.type === "LIFT") {
      const now = new Date();
      await this.db
        .update(schema.userRestrictions)
        .set({ liftedAt: now })
        .where(and(eq(schema.userRestrictions.userId, input.targetUserId), isNull(schema.userRestrictions.liftedAt)));
    } else {
      const restrictionType = RESTRICTION_TYPE_BY_ACTION[input.type];
      if (restrictionType) {
        await this.db.insert(schema.userRestrictions).values({
          userId: input.targetUserId,
          type: restrictionType,
          reason: input.reason,
          until: input.until ? new Date(input.until) : null,
          createdBy: input.actorId,
        });
      }
    }

    await this.db.insert(schema.moderationActions).values({
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      reportId: input.reportId ?? null,
      action: input.type,
      metadata: { reason: input.reason, until: input.until ?? null },
    });

    if (input.type === "SUSPEND" || input.type === "BAN") {
      await this.db.delete(schema.session).where(eq(schema.session.userId, input.targetUserId));

      const result = await this.checkIns.checkOut(input.targetUserId);
      if (result) await this.realtime.broadcastSeatChanges(result.roomId, result.changes);
    }
  }
}
