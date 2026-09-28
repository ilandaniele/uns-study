import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, gte, lte, sql } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import {
  CHECKIN_MINUTES,
  DISPUTE_MINUTES,
  FREE_OBS_MINUTES,
  type DisputeKind,
  type DisputeStatus,
  type DisputeVote,
  type LocationInput,
  type SeatDisputeDto,
  type SeatDisputeLiteDto,
} from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { ApiErrors } from "../common/api-error.js";

const UNIQUE_VIOLATION = "23505";
/** Same opener can't re-open a dispute on the same seat within this many minutes of a previous one resolving. */
const REOPEN_COOLDOWN_MIN = 10;

type SeatDisputeRow = typeof schema.seatDisputes.$inferSelect;

export interface OpenDisputeInput {
  userId: string;
  roomId: string;
  seatId: string;
  kind: DisputeKind;
  location: LocationInput;
}

/**
 * Domain logic for seat disputes: opening a CLAIM/ABSENT/SAVED challenge on a seat, voting,
 * the incumbent's response, and the 5-minute resolution (by deadline, by incumbent leaving, or
 * because the underlying check-in ended for any other reason). PostgreSQL remains canonical;
 * realtime events are notifications emitted after each commit.
 */
@Injectable()
export class DisputeService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(StudySessionService) private readonly studySessions: StudySessionService,
    @Inject(ReputationService) private readonly reputation: ReputationService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
  ) {}

  // ---- Opening ----

  async open(input: OpenDisputeInput): Promise<{ dispute: SeatDisputeDto; changes: SeatStateChange[] }> {
    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();

    const presence = this.presence.validate(room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!));

    const [seat] = await this.db
      .select()
      .from(schema.seats)
      .where(and(eq(schema.seats.id, input.seatId), eq(schema.seats.roomId, input.roomId), eq(schema.seats.active, true)))
      .limit(1);
    if (!seat) throw ApiErrors.seatNotFound();

    const [activeCheckIn] = await this.db
      .select()
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.seatId, input.seatId), eq(schema.checkIns.status, "ACTIVE")))
      .limit(1);

    if (activeCheckIn?.userId === input.userId) {
      throw ApiErrors.disputeNotAllowed("No podés abrir una disputa en tu propio asiento.");
    }

    if (input.kind === "CLAIM" || input.kind === "ABSENT") {
      if (!activeCheckIn) throw ApiErrors.disputeNotAllowed("Este asiento no tiene a nadie registrado.");
    } else {
      // SAVED: allowed on a seat currently derived OCCUPIED or UNCERTAIN, with or without a check-in
      // (e.g. belongings-only, or observation-derived occupancy).
      const live = await this.roomState.getLiveSeatStates(input.roomId, new Date());
      const seatState = live.get(input.seatId);
      if (!seatState || (seatState.status !== "OCCUPIED" && seatState.status !== "UNCERTAIN")) {
        throw ApiErrors.disputeNotAllowed("Este asiento no está ocupado.");
      }
    }

    const cooldownStart = new Date(Date.now() - REOPEN_COOLDOWN_MIN * 60_000);
    const [recentlyResolvedByMe] = await this.db
      .select({ id: schema.seatDisputes.id })
      .from(schema.seatDisputes)
      .where(
        and(
          eq(schema.seatDisputes.seatId, input.seatId),
          eq(schema.seatDisputes.openerUserId, input.userId),
          gte(schema.seatDisputes.resolvedAt, cooldownStart),
        ),
      )
      .limit(1);
    if (recentlyResolvedByMe) {
      throw ApiErrors.disputeNotAllowed("Esperá unos minutos antes de volver a abrir una disputa en este asiento.");
    }

    const now = new Date();
    const closesAt = new Date(now.getTime() + DISPUTE_MINUTES * 60_000);

    let created: SeatDisputeRow;
    try {
      created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.seatDisputes)
          .values({
            roomId: input.roomId,
            seatId: input.seatId,
            checkInId: activeCheckIn?.id ?? null,
            incumbentUserId: activeCheckIn?.userId ?? null,
            openerUserId: input.userId,
            kind: input.kind,
            status: "OPEN",
            openedAt: now,
            closesAt,
            locationAccuracyM: input.location.accuracy,
          })
          .returning();
        if (!row) throw new Error("Failed to create dispute");
        await tx.insert(schema.seatDisputeVotes).values({ disputeId: row.id, userId: input.userId, vote: "ABSENT", weight: 1, createdAt: now, updatedAt: now });
        return row;
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) throw ApiErrors.disputeAlreadyOpen();
      throw err;
    }

    await this.securityEvents.record({ userId: input.userId, eventType: "DISPUTE_OPENED", metadata: { seatId: input.seatId, kind: input.kind } });

    const changes = await this.roomState.recomputeSeats([input.seatId], {
      roomId: input.roomId,
      now,
      eventType: "DISPUTE_OPENED",
      actingUserId: input.userId,
    });
    await this.realtime.broadcastSeatChanges(input.roomId, changes);

    const dto = await this.toDtoById(created.id, input.userId);
    this.realtime.emitDisputeOpened(input.roomId, stripPrivate(dto));
    if (created.incumbentUserId) {
      this.realtime.emitDisputeChallenge(created.incumbentUserId, {
        disputeId: created.id,
        seatId: input.seatId,
        seatCode: seat.code,
        closesAt: created.closesAt.toISOString(),
      });
    }

    return { dispute: dto, changes };
  }

  // ---- Voting ----

  async vote(disputeId: string, userId: string, vote: DisputeVote, location: LocationInput): Promise<SeatDisputeDto> {
    const [row] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, disputeId)).limit(1);
    if (!row) throw ApiErrors.notFound("Disputa no encontrada.");
    if (row.incumbentUserId === userId) throw ApiErrors.disputeNotAllowed("El titular del asiento responde, no vota.");

    await this.lazilyResolveIfDue(row);
    if (row.status !== "OPEN" || row.closesAt.getTime() <= Date.now()) throw ApiErrors.disputeClosed();

    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, row.roomId)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();
    const presence = this.presence.validate(room, location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!));

    const now = new Date();
    await this.db
      .insert(schema.seatDisputeVotes)
      .values({ disputeId, userId, vote, weight: 1, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.seatDisputeVotes.disputeId, schema.seatDisputeVotes.userId],
        set: { vote, weight: 1, updatedAt: now },
      });

    const dto = await this.toDtoById(disputeId, userId);
    this.realtime.emitDisputeUpdated(row.roomId, stripPrivate(dto));
    return dto;
  }

  // ---- Incumbent response ----

  async respond(
    disputeId: string,
    userId: string,
    action: "STILL_HERE" | "LEFT",
    location?: LocationInput,
  ): Promise<{ dispute: SeatDisputeDto; changes: SeatStateChange[] }> {
    const [row] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, disputeId)).limit(1);
    if (!row) throw ApiErrors.notFound("Disputa no encontrada.");
    if (row.incumbentUserId !== userId) throw ApiErrors.forbidden("Solo el titular del asiento puede responder.");

    await this.lazilyResolveIfDue(row);
    if (row.status !== "OPEN" || row.closesAt.getTime() <= Date.now()) throw ApiErrors.disputeClosed();

    const now = new Date();

    if (action === "STILL_HERE") {
      if (!location) throw ApiErrors.validation("Ubicación requerida.");
      const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, row.roomId)).limit(1);
      if (!room) throw ApiErrors.roomNotFound();
      const presence = this.presence.validate(room, location);
      if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!));

      await this.db
        .insert(schema.seatDisputeVotes)
        .values({ disputeId, userId, vote: "PRESENT", weight: 1, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.seatDisputeVotes.disputeId, schema.seatDisputeVotes.userId],
          set: { vote: "PRESENT", updatedAt: now },
        });

      const dto = await this.toDtoById(disputeId, userId);
      this.realtime.emitDisputeUpdated(row.roomId, stripPrivate(dto));
      return { dispute: dto, changes: [] };
    }

    // LEFT: the incumbent's own check-in ends and the dispute resolves immediately as
    // RESOLVED_ABSENT (regardless of the current vote tally), same as any other check-in ending.
    const openerRestricted = row.kind === "CLAIM" ? await this.isOpenerRestricted(row.openerUserId) : false;
    const resolved = await this.db.transaction(async (tx) => {
      // Serializes concurrent resolvers of the same dispute (works under both Postgres and PGlite;
      // see `RoomStateService.recomputeSeatsLocked`).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${disputeId}))`);

      const claimed = await tx
        .update(schema.seatDisputes)
        .set({ status: "RESOLVED_ABSENT", resolvedAt: now })
        .where(and(eq(schema.seatDisputes.id, disputeId), eq(schema.seatDisputes.status, "OPEN")))
        .returning();
      if (claimed.length === 0) return null;

      if (row.checkInId) {
        const [checkIn] = await tx.select().from(schema.checkIns).where(eq(schema.checkIns.id, row.checkInId)).limit(1);
        if (checkIn && checkIn.status === "ACTIVE") {
          await tx.update(schema.checkIns).set({ status: "CANCELLED", endedAt: now, updatedAt: now }).where(eq(schema.checkIns.id, checkIn.id));
          await this.studySessions.recordFromCheckIn(tx, checkIn, now);
        }
      }

      let extraSeatIds: string[] = [];
      if (row.kind === "CLAIM" && !openerRestricted) extraSeatIds = await this.createClaimCheckIn(tx, row, now);
      if (row.kind === "SAVED") extraSeatIds = await this.applySavedFreeSignal(tx, row, now);

      return { extraSeatIds };
    });
    if (!resolved) throw ApiErrors.disputeClosed();

    const changes = await this.finalizeResolution(row, "RESOLVED_ABSENT", resolved.extraSeatIds, now, userId, "INCUMBENT_LEFT");
    const dto = await this.toDtoById(disputeId, userId);
    return { dispute: dto, changes };
  }

  // ---- Reads ----

  async listOpenForRoom(roomId: string, viewerId: string | null): Promise<SeatDisputeDto[]> {
    const rows = await this.db
      .select()
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "OPEN")));
    const due = rows.filter((r) => r.closesAt.getTime() <= Date.now());
    for (const row of due) await this.resolveAndEmit(row.id, new Date());
    if (due.length === 0) return Promise.all(rows.map((r) => this.rowToDto(r, viewerId)));

    const fresh = await this.db
      .select()
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "OPEN")));
    return Promise.all(fresh.map((r) => this.rowToDto(r, viewerId)));
  }

  async getById(id: string, viewerId: string | null): Promise<SeatDisputeDto> {
    const [row] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, id)).limit(1);
    if (!row) throw ApiErrors.notFound("Disputa no encontrada.");
    await this.lazilyResolveIfDue(row);
    return this.toDtoById(id, viewerId);
  }

  // ---- Resolution ----

  /** Called every 15s by `DisputeResolutionJob`, and lazily whenever a closed-but-OPEN dispute is read/voted on. */
  async resolveDue(now: Date = new Date()): Promise<void> {
    const due = await this.db
      .select({ id: schema.seatDisputes.id })
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.status, "OPEN"), lte(schema.seatDisputes.closesAt, now)));
    for (const row of due) await this.resolveAndEmit(row.id, now);
  }

  /**
   * Resolves immediately as RESOLVED_ABSENT any OPEN dispute linked to `checkInId` — called
   * whenever the incumbent's check-in ends for any other reason (checkout, move, expiry, reset).
   */
  async resolveForEndedCheckIn(checkInId: string, now: Date = new Date()): Promise<void> {
    const [row] = await this.db
      .select()
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.checkInId, checkInId), eq(schema.seatDisputes.status, "OPEN")))
      .limit(1);
    if (!row) return;

    const openerRestricted = row.kind === "CLAIM" ? await this.isOpenerRestricted(row.openerUserId) : false;
    const resolved = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${row.id}))`);

      const claimed = await tx
        .update(schema.seatDisputes)
        .set({ status: "RESOLVED_ABSENT", resolvedAt: now })
        .where(and(eq(schema.seatDisputes.id, row.id), eq(schema.seatDisputes.status, "OPEN")))
        .returning();
      if (claimed.length === 0) return null;

      let extraSeatIds: string[] = [];
      if (row.kind === "CLAIM" && !openerRestricted) extraSeatIds = await this.createClaimCheckIn(tx, row, now);
      if (row.kind === "SAVED") extraSeatIds = await this.applySavedFreeSignal(tx, row, now);

      return { extraSeatIds };
    });
    if (!resolved) return;

    await this.finalizeResolution(row, "RESOLVED_ABSENT", resolved.extraSeatIds, now, null, "CHECK_IN_ENDED");
  }

  // ---- Internals ----

  private async lazilyResolveIfDue(row: SeatDisputeRow): Promise<void> {
    if (row.status === "OPEN" && row.closesAt.getTime() <= Date.now()) {
      await this.resolveAndEmit(row.id, new Date());
    }
  }

  private async isOpenerRestricted(userId: string): Promise<boolean> {
    const active = await this.restrictions.activeRestrictions(userId);
    return active.some((r) => r.type === "SUSPENDED" || r.type === "BANNED");
  }

  /** Tallies votes and resolves one dispute by its 5-minute deadline. Idempotent under concurrency
   *  via the conditional `WHERE status='OPEN'` update — a losing racer's update returns 0 rows. */
  private async resolveAndEmit(disputeId: string, now: Date): Promise<void> {
    const [pre] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, disputeId)).limit(1);
    if (!pre || pre.status !== "OPEN") return;
    const openerRestricted = pre.kind === "CLAIM" ? await this.isOpenerRestricted(pre.openerUserId) : false;

    const resolved = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${disputeId}))`);

      const voteRows = await tx
        .select({ vote: schema.seatDisputeVotes.vote, weight: schema.seatDisputeVotes.weight })
        .from(schema.seatDisputeVotes)
        .where(eq(schema.seatDisputeVotes.disputeId, disputeId));
      const present = voteRows.filter((v) => v.vote === "PRESENT").reduce((sum, v) => sum + v.weight, 0);
      const absent = voteRows.filter((v) => v.vote === "ABSENT").reduce((sum, v) => sum + v.weight, 0);

      let finalStatus: DisputeStatus;
      if (absent > present) finalStatus = "RESOLVED_ABSENT";
      else if (present > absent) finalStatus = "RESOLVED_PRESENT";
      // SAVED never ties: a tie means nobody could confirm it's actually saved, so it stays PRESENT.
      else finalStatus = pre.kind === "SAVED" ? "RESOLVED_PRESENT" : "TIED";

      const claimed = await tx
        .update(schema.seatDisputes)
        .set({ status: finalStatus, resolvedAt: now })
        .where(and(eq(schema.seatDisputes.id, disputeId), eq(schema.seatDisputes.status, "OPEN")))
        .returning();
      if (claimed.length === 0) return null;

      let extraSeatIds: string[] = [];
      if (finalStatus === "RESOLVED_ABSENT") {
        if (pre.checkInId) {
          const [checkIn] = await tx.select().from(schema.checkIns).where(eq(schema.checkIns.id, pre.checkInId)).limit(1);
          if (checkIn && checkIn.status === "ACTIVE") {
            await tx.update(schema.checkIns).set({ status: "CANCELLED", endedAt: now, updatedAt: now }).where(eq(schema.checkIns.id, checkIn.id));
            await this.studySessions.recordFromCheckIn(tx, checkIn, now);
          }
        }
        if (pre.kind === "CLAIM" && !openerRestricted) extraSeatIds = await this.createClaimCheckIn(tx, pre, now);
        if (pre.kind === "SAVED") extraSeatIds = await this.applySavedFreeSignal(tx, pre, now);
      }

      return { finalStatus, extraSeatIds };
    });
    if (!resolved) return;

    await this.finalizeResolution(pre, resolved.finalStatus, resolved.extraSeatIds, now, null);
  }

  /** Shared post-commit side effects: reputation hit, seat recompute (which is what actually
   *  records the `DISPUTE_RESOLVED` `seat_state_events` row, via `seatMetadata`), `SAVED`'s
   *  explicit source label, and the realtime broadcasts. Runs outside any transaction, like the
   *  rest of the app. */
  private async finalizeResolution(
    row: SeatDisputeRow,
    finalStatus: DisputeStatus,
    extraSeatIds: string[],
    now: Date,
    actingUserId: string | null,
    reason?: string,
  ): Promise<SeatStateChange[]> {
    if (finalStatus === "RESOLVED_PRESENT") {
      await this.reputation.incrementRejectedObservations(row.openerUserId);
      await this.securityEvents.record({ userId: row.openerUserId, eventType: "DISPUTE_LOST", metadata: { disputeId: row.id, seatId: row.seatId } });
    }

    const changes = await this.roomState.recomputeSeats([row.seatId, ...extraSeatIds], {
      roomId: row.roomId,
      now,
      eventType: "DISPUTE_RESOLVED",
      actingUserId,
      seatMetadata: { [row.seatId]: { disputeId: row.id, kind: row.kind, status: finalStatus, ...(reason ? { reason } : {}) } },
    });

    if (row.kind === "SAVED" && finalStatus === "RESOLVED_ABSENT") {
      await this.db.update(schema.seatCurrentState).set({ sourceSummary: "SAVED" }).where(eq(schema.seatCurrentState.seatId, row.seatId));
    }

    await this.realtime.broadcastSeatChanges(row.roomId, changes);
    const dto = await this.toDtoById(row.id, null);
    this.realtime.emitDisputeResolved(row.roomId, stripPrivate(dto));
    return changes;
  }

  /** CLAIM win: creates the opener's check-in on the disputed seat, moving them off any other
   *  active seat first (same move semantics `CheckInService` uses). Returns extra seats to recompute. */
  private async createClaimCheckIn(tx: Db, row: SeatDisputeRow, now: Date): Promise<string[]> {
    const [openerExisting] = await tx
      .select()
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, row.openerUserId), eq(schema.checkIns.status, "ACTIVE")))
      .limit(1);

    const extraSeatIds: string[] = [];
    if (openerExisting) {
      if (openerExisting.seatId !== row.seatId) extraSeatIds.push(openerExisting.seatId);
      await tx.update(schema.checkIns).set({ status: "COMPLETED", endedAt: now, updatedAt: now }).where(eq(schema.checkIns.id, openerExisting.id));
      await this.studySessions.recordFromCheckIn(tx, openerExisting, now);
    }

    await tx.insert(schema.checkIns).values({
      userId: row.openerUserId,
      roomId: row.roomId,
      seatId: row.seatId,
      status: "ACTIVE",
      showIdentity: false,
      presenceVerified: true,
      locationAccuracyM: row.locationAccuracyM ?? null,
      startedAt: now,
      expiresAt: new Date(now.getTime() + CHECKIN_MINUTES * 60_000),
    });

    return extraSeatIds;
  }

  /** SAVED win: expires any active OCCUPIED observations and writes a system FREE signal so the
   *  seat derives to FREE; `finalizeResolution` then overrides `sourceSummary` to `"SAVED"`. */
  private async applySavedFreeSignal(tx: Db, row: SeatDisputeRow, now: Date): Promise<string[]> {
    await tx
      .update(schema.seatObservations)
      .set({ expiresAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.seatObservations.seatId, row.seatId),
          eq(schema.seatObservations.observedStatus, "OCCUPIED"),
          gt(schema.seatObservations.expiresAt, now),
        ),
      );
    await tx.insert(schema.seatObservations).values({
      userId: row.openerUserId,
      roomId: row.roomId,
      seatId: row.seatId,
      observedStatus: "FREE",
      presenceVerified: true,
      qrVerified: false,
      confidenceWeight: 2,
      observedAt: now,
      expiresAt: new Date(now.getTime() + FREE_OBS_MINUTES * 60_000),
    });
    return [];
  }

  private async toDtoById(id: string, viewerId: string | null): Promise<SeatDisputeDto> {
    const [row] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, id)).limit(1);
    if (!row) throw new Error("Dispute vanished after write");
    return this.rowToDto(row, viewerId);
  }

  private async rowToDto(row: SeatDisputeRow, viewerId: string | null): Promise<SeatDisputeDto> {
    const voteRows = await this.db
      .select({ userId: schema.seatDisputeVotes.userId, vote: schema.seatDisputeVotes.vote, weight: schema.seatDisputeVotes.weight })
      .from(schema.seatDisputeVotes)
      .where(eq(schema.seatDisputeVotes.disputeId, row.id));
    const present = voteRows.filter((v) => v.vote === "PRESENT").reduce((sum, v) => sum + v.weight, 0);
    const absent = voteRows.filter((v) => v.vote === "ABSENT").reduce((sum, v) => sum + v.weight, 0);
    const mine = viewerId ? voteRows.find((v) => v.userId === viewerId) : undefined;

    return {
      id: row.id,
      seatId: row.seatId,
      kind: row.kind,
      status: row.status,
      openedAt: new Date(row.openedAt).toISOString(),
      closesAt: new Date(row.closesAt).toISOString(),
      votes: { present, absent },
      myVote: mine ? mine.vote : null,
      iAmIncumbent: viewerId != null && row.incumbentUserId === viewerId,
      iAmOpener: viewerId != null && row.openerUserId === viewerId,
    };
  }
}

function stripPrivate(dto: SeatDisputeDto): SeatDisputeLiteDto {
  return {
    id: dto.id,
    seatId: dto.seatId,
    kind: dto.kind,
    status: dto.status,
    openedAt: dto.openedAt,
    closesAt: dto.closesAt,
    votes: dto.votes,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === UNIQUE_VIOLATION;
}

function presenceMessage(reason: string): string {
  switch (reason) {
    case "OUTSIDE_GEOFENCE":
      return "Tenés que estar dentro de la sala para hacer esto.";
    case "STALE_LOCATION":
      return "Tu ubicación está desactualizada, volvé a intentarlo.";
    case "POOR_ACCURACY":
      return "La precisión del GPS es muy baja, intentá de nuevo.";
    case "ROOM_NOT_FOUND":
      return "Sala no encontrada.";
    default:
      return "No pudimos validar tu ubicación.";
  }
}
