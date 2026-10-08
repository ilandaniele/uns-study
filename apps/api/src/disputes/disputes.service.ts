import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import {
  DISPUTE_MINUTES,
  FREE_OBS_MINUTES,
  type DisputeKind,
  type DisputeStatus,
  type DisputeVote,
  type LocationInput,
  type SeatDisputeDto,
  type SeatDisputeLiteDto,
} from "@sala/contracts";
import { DB } from "../database/database.module.js";
import { RoomStateService, type SeatStateChange } from "../rooms/room-state.service.js";
import { PresenceService } from "../presence/presence.service.js";
import { SecurityEventService } from "../security/security-event.service.js";
import { RateLimitService } from "../security/rate-limit.service.js";
import { AbusePolicyService } from "../security/abuse-policy.service.js";
import { StudySessionService } from "../rankings/study-session.service.js";
import { ReputationService } from "../reputation/reputation.service.js";
import { RestrictionService } from "../users/restriction.service.js";
import { RoomRealtimeGateway } from "../realtime/room-realtime.gateway.js";
import { ApiErrors, ApiException } from "../common/api-error.js";
import { isCheckInVerified } from "../checkins/verification.js";
import { presenceMessage } from "../checkins/checkins.service.js";
import { isUniqueViolation } from "../common/pg-errors.js";
import { runInBackground } from "../common/background.js";
import { NotificationService } from "../notifications/notification.service.js";

/** Same opener can't re-open a dispute on the same seat within this many minutes of a previous one resolving. */
const REOPEN_COOLDOWN_MIN = 10;
/** After *any* dispute on a seat resolves in the incumbent's favor (RESOLVED_PRESENT/TIED), the
 *  seat is off-limits to *any* new dispute (any opener) for this many minutes — stops a losing
 *  challenger from immediately re-opening (possibly via a friend) to keep harassing the incumbent. */
const SEAT_COOLDOWN_MIN = 10;

type SeatDisputeRow = typeof schema.seatDisputes.$inferSelect;

export interface OpenDisputeInput {
  userId: string;
  roomId: string;
  seatId: string;
  kind: DisputeKind;
  location: LocationInput;
}

/** Same bucket and numbers `DisputesController` enforces on `POST /disputes`. */
const DISPUTE_OPEN_LIMIT = 3;
const DISPUTE_OPEN_WINDOW_SECONDS = 3600;

/**
 * Domain logic for seat disputes: opening a CLAIM/ABSENT/SAVED challenge on a seat, voting,
 * the incumbent's response, and the 5-minute resolution (by deadline, by incumbent leaving, or
 * because the underlying check-in ended for any other reason). PostgreSQL remains canonical;
 * realtime events are notifications emitted after each commit.
 */
@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RoomStateService) private readonly roomState: RoomStateService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(SecurityEventService) private readonly securityEvents: SecurityEventService,
    @Inject(StudySessionService) private readonly studySessions: StudySessionService,
    @Inject(ReputationService) private readonly reputation: ReputationService,
    @Inject(RestrictionService) private readonly restrictions: RestrictionService,
    @Inject(RoomRealtimeGateway) private readonly realtime: RoomRealtimeGateway,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(AbusePolicyService) private readonly abusePolicy: AbusePolicyService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  // ---- Opening ----

  /** Checks presence before the controller spends one of the 3/hour dispute slots on a weak GPS fix. */
  async assertPresence(roomId: string, location: OpenDisputeInput["location"]): Promise<void> {
    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).limit(1);
    if (!room) return;
    const presence = this.presence.validate(room, location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!), presence.details);
  }

  async open(
    input: OpenDisputeInput,
    opts: {
      /** Spend a `dispute:open:<userId>` slot here, after the cooldown checks (the controller spends it itself). */
      checkRateLimit?: boolean;
      /** Which push the incumbent gets: a plain dispute, or a vote opened by an "Está libre" report. */
      challengeReason?: "dispute" | "marked-free-vote";
    } = {},
  ): Promise<{ dispute: SeatDisputeDto; changes: SeatStateChange[] }> {
    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();

    const presence = this.presence.validate(room, input.location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!), presence.details);

    const [seat] = await this.db
      .select()
      .from(schema.seats)
      .where(and(eq(schema.seats.id, input.seatId), eq(schema.seats.roomId, input.roomId), eq(schema.seats.active, true)))
      .limit(1);
    if (!seat) throw ApiErrors.seatNotFound();

    if (input.kind === "SAVED") {
      // SAVED: allowed on a seat currently derived OCCUPIED, SAVED or UNCERTAIN, with or without a check-in
      // (e.g. belongings-only, or observation-derived occupancy).
      const live = await this.roomState.getLiveSeatStates(input.roomId, new Date());
      const seatState = live.get(input.seatId);
      if (!seatState || (seatState.status !== "OCCUPIED" && seatState.status !== "UNCERTAIN" && seatState.status !== "SAVED")) {
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

    const seatCooldownStart = new Date(Date.now() - SEAT_COOLDOWN_MIN * 60_000);
    const [recentSeatLoss] = await this.db
      .select({ id: schema.seatDisputes.id })
      .from(schema.seatDisputes)
      .where(
        and(
          eq(schema.seatDisputes.seatId, input.seatId),
          gte(schema.seatDisputes.resolvedAt, seatCooldownStart),
          inArray(schema.seatDisputes.status, ["RESOLVED_PRESENT", "TIED"]),
        ),
      )
      .limit(1);
    if (recentSeatLoss) {
      throw ApiErrors.disputeNotAllowed("Esperá unos minutos antes de volver a abrir una disputa en este asiento.");
    }

    if (opts.checkRateLimit) {
      const limit = await this.rateLimit.check(`dispute:open:${input.userId}`, DISPUTE_OPEN_LIMIT, DISPUTE_OPEN_WINDOW_SECONDS);
      if (!limit.allowed) throw ApiErrors.rateLimited();
    }

    const now = new Date();
    const closesAt = new Date(now.getTime() + DISPUTE_MINUTES * 60_000);

    let created: SeatDisputeRow;
    try {
      created = await this.db.transaction(async (tx) => {
        // Serializes with `RoomStateService.recomputeSeatsLocked` and the check-in transaction so
        // the "is there an active check-in" read below can't race a concurrent check-in/move.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.seatId}))`);

        const [activeCheckIn] = await tx
          .select()
          .from(schema.checkIns)
          .where(and(eq(schema.checkIns.seatId, input.seatId), eq(schema.checkIns.status, "ACTIVE")))
          .limit(1);

        if (activeCheckIn?.userId === input.userId) {
          throw ApiErrors.disputeNotAllowed("No podés abrir una disputa en tu propio asiento.");
        }
        if (activeCheckIn && isCheckInVerified(activeCheckIn.verifiedAt, activeCheckIn.expiresAt)) {
          throw ApiErrors.disputeNotAllowed("Este lugar está verificado con foto.");
        }
        if ((input.kind === "CLAIM" || input.kind === "ABSENT") && !activeCheckIn) {
          throw ApiErrors.disputeNotAllowed("Este asiento no tiene a nadie registrado.");
        }

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
      const incumbentUserId = created.incumbentUserId;
      const reason = opts.challengeReason ?? "dispute";
      runInBackground(this.logger, "dispute challenge push", () =>
        this.notifications.notifySeatChallenged({ userId: incumbentUserId, roomId: input.roomId, seatId: input.seatId, seatCode: seat.code, reason }),
      );
    } else if (input.kind === "SAVED") {
      // Nobody is checked in: whoever marked it "Está guardado" (e.g. its owner, away for a bit)
      // is the closest thing to a holder — tell them a vote to free it is running.
      runInBackground(this.logger, "saved challenge push", () => this.notifySavedObservers(input.roomId, input.seatId, seat.code, input.userId, now));
    }

    return { dispute: dto, changes };
  }

  /**
   * "Está libre" on a seat someone else holds (an active check-in -> ABSENT, or a seat that reads
   * "guardado" -> SAVED) opens the timed vote instead of leaving two contradicting reports. Same
   * rules as `POST /disputes` (presence, cooldowns, photo protection, the 3/hour open bucket);
   * returns null when any of them says no, so the caller falls back to a plain observation.
   */
  async openFromFreeObservation(input: OpenDisputeInput): Promise<{ dispute: SeatDisputeDto; changes: SeatStateChange[] } | null> {
    try {
      return await this.open(input, { checkRateLimit: true, challengeReason: input.kind === "SAVED" ? "dispute" : "marked-free-vote" });
    } catch (err) {
      if (err instanceof ApiException && ["DISPUTE_NOT_ALLOWED", "DISPUTE_ALREADY_OPEN", "RATE_LIMITED"].includes(err.code)) return null;
      throw err;
    }
  }

  /** The seat's OPEN dispute as `viewerId` sees it, or null. */
  async findOpenForSeat(seatId: string, viewerId: string): Promise<SeatDisputeDto | null> {
    const [row] = await this.db
      .select()
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.seatId, seatId), eq(schema.seatDisputes.status, "OPEN")))
      .limit(1);
    if (!row || row.closesAt.getTime() <= Date.now()) return null;
    return this.rowToDto(row, viewerId);
  }

  /** Pushes everyone (but `exceptUserId`) whose "Está guardado" report on the seat is still live. */
  async notifySavedObservers(roomId: string, seatId: string, seatCode: string, exceptUserId: string, now: Date = new Date()): Promise<void> {
    const savers = await this.db
      .selectDistinct({ userId: schema.seatObservations.userId })
      .from(schema.seatObservations)
      .where(
        and(
          eq(schema.seatObservations.seatId, seatId),
          eq(schema.seatObservations.observedStatus, "SAVED"),
          gt(schema.seatObservations.expiresAt, now),
          ne(schema.seatObservations.userId, exceptUserId),
        ),
      );
    for (const { userId } of savers) {
      await this.notifications.notifySeatChallenged({ userId, roomId, seatId, seatCode, reason: "saved-challenged" });
    }
  }

  // ---- Voting ----

  async vote(disputeId: string, userId: string, vote: DisputeVote, location: LocationInput): Promise<SeatDisputeDto> {
    await this.restrictions.assertNot(userId, ["RESTRICT_OBSERVATIONS", "SUSPENDED", "BANNED"]);

    const [row] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, disputeId)).limit(1);
    if (!row) throw ApiErrors.notFound("Disputa no encontrada.");
    if (row.incumbentUserId === userId) throw ApiErrors.disputeNotAllowed("El titular del asiento responde, no vota.");

    await this.lazilyResolveIfDue(row);
    if (row.status !== "OPEN" || row.closesAt.getTime() <= Date.now()) throw ApiErrors.disputeClosed();

    const [room] = await this.db.select().from(schema.rooms).where(eq(schema.rooms.id, row.roomId)).limit(1);
    if (!room) throw ApiErrors.roomNotFound();
    const presence = this.presence.validate(room, location);
    if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!), presence.details);

    const [voterCheckIn] = await this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.status, "ACTIVE"), eq(schema.checkIns.roomId, row.roomId)))
      .limit(1);
    if (!voterCheckIn) {
      throw ApiErrors.disputeNotAllowed("Para votar tenés que tener un lugar marcado en la sala.");
    }

    const now = new Date();
    const changed = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${disputeId}))`);

      const [stillOpen] = await tx
        .select({ status: schema.seatDisputes.status })
        .from(schema.seatDisputes)
        .where(eq(schema.seatDisputes.id, disputeId))
        .limit(1);
      if (!stillOpen || stillOpen.status !== "OPEN") throw ApiErrors.disputeClosed();

      const [existingVote] = await tx
        .select({ vote: schema.seatDisputeVotes.vote })
        .from(schema.seatDisputeVotes)
        .where(and(eq(schema.seatDisputeVotes.disputeId, disputeId), eq(schema.seatDisputeVotes.userId, userId)))
        .limit(1);
      if (existingVote?.vote === vote) return false;

      await tx
        .insert(schema.seatDisputeVotes)
        .values({ disputeId, userId, vote, weight: 1, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.seatDisputeVotes.disputeId, schema.seatDisputeVotes.userId],
          set: { vote, weight: 1, updatedAt: now },
        });
      return true;
    });

    const dto = await this.toDtoById(disputeId, userId);
    if (changed) this.realtime.emitDisputeUpdated(row.roomId, stripPrivate(dto));
    return dto;
  }

  // ---- Incumbent response ----

  async respond(
    disputeId: string,
    userId: string,
    action: "STILL_HERE" | "LEFT",
    location?: LocationInput,
  ): Promise<{ dispute: SeatDisputeDto; changes: SeatStateChange[] }> {
    await this.restrictions.assertNot(userId, ["SUSPENDED", "BANNED"]);

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
      if (!presence.valid) throw ApiErrors.presenceRejected(presence.reason!, presenceMessage(presence.reason!), presence.details);

      const changed = await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${disputeId}))`);

        const [stillOpen] = await tx
          .select({ status: schema.seatDisputes.status })
          .from(schema.seatDisputes)
          .where(eq(schema.seatDisputes.id, disputeId))
          .limit(1);
        if (!stillOpen || stillOpen.status !== "OPEN") throw ApiErrors.disputeClosed();

        const [existingVote] = await tx
          .select({ vote: schema.seatDisputeVotes.vote })
          .from(schema.seatDisputeVotes)
          .where(and(eq(schema.seatDisputeVotes.disputeId, disputeId), eq(schema.seatDisputeVotes.userId, userId)))
          .limit(1);
        if (existingVote?.vote === "PRESENT") return false;

        await tx
          .insert(schema.seatDisputeVotes)
          .values({ disputeId, userId, vote: "PRESENT", weight: 1, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: [schema.seatDisputeVotes.disputeId, schema.seatDisputeVotes.userId],
            set: { vote: "PRESENT", updatedAt: now },
          });
        return true;
      });

      const dto = await this.toDtoById(disputeId, userId);
      if (changed) this.realtime.emitDisputeUpdated(row.roomId, stripPrivate(dto));
      return { dispute: dto, changes: [] };
    }

    // LEFT: the incumbent's own check-in ends and the dispute resolves immediately as
    // RESOLVED_ABSENT (regardless of the current vote tally), same as any other check-in ending.
    const openerRestricted = row.kind === "CLAIM" ? await this.isOpenerRestricted(row.openerUserId) : false;
    const freeWeight = await this.freeSignalWeight(row);
    if (row.kind === "SAVED") await this.countAsObservation(row.openerUserId);

    const resolved = await this.db.transaction(async (tx) => {
      // Serializes concurrent resolvers of the same dispute (works under both Postgres and PGlite;
      // see `RoomStateService.recomputeSeatsLocked`).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${disputeId}))`);

      const claimed = await tx
        .update(schema.seatDisputes)
        .set({ status: "RESOLVED_ABSENT", resolvedAt: now })
        .where(and(eq(schema.seatDisputes.id, disputeId), eq(schema.seatDisputes.status, "OPEN")))
        .returning();
      if (claimed.length === 0) return false;

      if (row.checkInId) {
        const [checkIn] = await tx.select().from(schema.checkIns).where(eq(schema.checkIns.id, row.checkInId)).limit(1);
        if (checkIn && checkIn.status === "ACTIVE") {
          // Conditional on still being ACTIVE: a concurrent checkout/sweep may have closed (and recorded) it already.
          const cancelled = await tx
            .update(schema.checkIns)
            .set({ status: "CANCELLED", endedAt: now, updatedAt: now })
            .where(and(eq(schema.checkIns.id, checkIn.id), eq(schema.checkIns.status, "ACTIVE")))
            .returning({ id: schema.checkIns.id });
          if (cancelled.length > 0) await this.studySessions.recordFromCheckIn(tx, checkIn, now);
        }
      }

      if (freeWeight != null) await this.applyFreeSignal(tx, row, now, freeWeight);

      return true;
    });
    if (!resolved) throw ApiErrors.disputeClosed();

    const changes = await this.finalizeResolution(row, "RESOLVED_ABSENT", now, userId, openerRestricted, "INCUMBENT_LEFT");
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
    for (const row of due) {
      try {
        await this.resolveAndEmit(row.id, new Date());
      } catch (err) {
        this.logger.error(`Failed to lazily resolve dispute ${row.id} while listing room ${roomId}`, err instanceof Error ? err.stack : String(err));
      }
    }
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
    for (const row of due) {
      try {
        await this.resolveAndEmit(row.id, now);
      } catch (err) {
        this.logger.error(`Failed to resolve dispute ${row.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
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
    await this.resolveOpenAsAbsent(row, now, "CHECK_IN_ENDED");
  }

  /**
   * Someone just checked in ("Estoy acá") on a seat whose OPEN vote has no incumbent (a "guardado"
   * seat being asked to free up): the question is answered — the seat was free and is now taken —
   * so it resolves RESOLVED_ABSENT right away instead of showing the new occupant "Dudoso".
   * Returns the seat changes (empty if there was nothing to resolve).
   */
  async resolveForSeatTaken(seatId: string, now: Date = new Date()): Promise<SeatStateChange[]> {
    const [row] = await this.db
      .select()
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.seatId, seatId), eq(schema.seatDisputes.status, "OPEN")))
      .limit(1);
    if (!row || row.checkInId != null) return [];
    return this.resolveOpenAsAbsent(row, now, "SEAT_TAKEN");
  }

  /**
   * "Sigo acá" (extend) while the caller's own check-in is being voted on counts as the incumbent
   * answering STILL_HERE — the same GPS-validated presence the challenge banner's button sends.
   * Best-effort: the extension itself already succeeded.
   */
  async respondStillHereIfChallenged(checkInId: string, userId: string, location: LocationInput): Promise<void> {
    try {
      const [row] = await this.db
        .select({ id: schema.seatDisputes.id })
        .from(schema.seatDisputes)
        .where(and(eq(schema.seatDisputes.checkInId, checkInId), eq(schema.seatDisputes.status, "OPEN")))
        .limit(1);
      if (!row) return;
      await this.respond(row.id, userId, "STILL_HERE", location);
    } catch (err) {
      this.logger.warn(`Extend could not answer a dispute on check-in ${checkInId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Resolves one OPEN dispute as RESOLVED_ABSENT regardless of the tally (the incumbent's check-in ended, or the seat got taken). */
  private async resolveOpenAsAbsent(row: SeatDisputeRow, now: Date, reason: string): Promise<SeatStateChange[]> {
    const openerRestricted = row.kind === "CLAIM" ? await this.isOpenerRestricted(row.openerUserId) : false;
    const freeWeight = await this.freeSignalWeight(row);
    if (row.kind === "SAVED") await this.countAsObservation(row.openerUserId);

    const resolved = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${row.id}))`);

      const claimed = await tx
        .update(schema.seatDisputes)
        .set({ status: "RESOLVED_ABSENT", resolvedAt: now })
        .where(and(eq(schema.seatDisputes.id, row.id), eq(schema.seatDisputes.status, "OPEN")))
        .returning();
      if (claimed.length === 0) return false;

      if (freeWeight != null) await this.applyFreeSignal(tx, row, now, freeWeight);

      return true;
    });
    if (!resolved) return [];

    return this.finalizeResolution(row, "RESOLVED_ABSENT", now, null, openerRestricted, reason);
  }

  // ---- Internals ----

  private async lazilyResolveIfDue(row: SeatDisputeRow): Promise<void> {
    if (row.status === "OPEN" && row.closesAt.getTime() <= Date.now()) {
      try {
        await this.resolveAndEmit(row.id, new Date());
      } catch (err) {
        this.logger.error(`Failed to lazily resolve dispute ${row.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
  }

  private async isOpenerRestricted(userId: string): Promise<boolean> {
    const active = await this.restrictions.activeRestrictions(userId);
    return active.some((r) => r.type === "SUSPENDED" || r.type === "BANNED" || r.type === "RESTRICT_OBSERVATIONS");
  }

  /** The opener's observation weight when a RESOLVED_ABSENT should leave a FREE signal on the seat
   *  (ABSENT/SAVED: "no está" / "se fue" means the seat is free), or null for a CLAIM — there the
   *  opener is about to sit down themselves, so the seat must not be advertised to the room as free. */
  private async freeSignalWeight(row: SeatDisputeRow): Promise<number | null> {
    if (row.kind === "CLAIM") return null;
    return this.reputation.observationWeight(row.openerUserId);
  }

  /** Records the SAVED win as consuming the opener's observation budget — it's equivalent to a
   *  FREE observation, so it counts against the same `observation:<userId>` rate-limit bucket
   *  `ObservationsController` uses (regardless of whether it would itself have been allowed). */
  private async countAsObservation(userId: string): Promise<void> {
    const limits = await this.abusePolicy.observationLimits(userId);
    await this.rateLimit.check(`observation:${userId}`, limits.perMinuteLimit, 60);
  }

  /** Tallies votes and resolves one dispute by its 5-minute deadline. Idempotent under concurrency
   *  via the conditional `WHERE status='OPEN'` update — a losing racer's update returns 0 rows. */
  private async resolveAndEmit(disputeId: string, now: Date): Promise<void> {
    const [pre] = await this.db.select().from(schema.seatDisputes).where(eq(schema.seatDisputes.id, disputeId)).limit(1);
    if (!pre || pre.status !== "OPEN") return;
    const openerRestricted = pre.kind === "CLAIM" ? await this.isOpenerRestricted(pre.openerUserId) : false;
    const freeWeight = await this.freeSignalWeight(pre);
    if (pre.kind === "SAVED") await this.countAsObservation(pre.openerUserId);

    const resolved = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${disputeId}))`);

      const voteRows = await tx
        .select({ userId: schema.seatDisputeVotes.userId, vote: schema.seatDisputeVotes.vote, weight: schema.seatDisputeVotes.weight })
        .from(schema.seatDisputeVotes)
        .where(eq(schema.seatDisputeVotes.disputeId, disputeId));
      const present = voteRows.filter((v) => v.vote === "PRESENT").reduce((sum, v) => sum + v.weight, 0);
      const absent = voteRows.filter((v) => v.vote === "ABSENT").reduce((sum, v) => sum + v.weight, 0);
      // The incumbent affirmatively responded STILL_HERE (with a valid, freshly-validated
      // presence check) — overturning that takes more than a bare majority: at least two ABSENT
      // votes from people other than the opener (whose own ABSENT vote is automatic on open).
      const incumbentRespondedPresent = pre.incumbentUserId != null && voteRows.some((v) => v.userId === pre.incumbentUserId && v.vote === "PRESENT");
      const nonOpenerAbsentCount = voteRows.filter((v) => v.vote === "ABSENT" && v.userId !== pre.openerUserId).length;

      let finalStatus: DisputeStatus;
      const absentWins = absent > present && (!incumbentRespondedPresent || nonOpenerAbsentCount >= 2);
      if (absentWins) finalStatus = "RESOLVED_ABSENT";
      else if (present > absent) finalStatus = "RESOLVED_PRESENT";
      // SAVED never ties: a tie means nobody could confirm it's actually saved, so it stays PRESENT.
      // Same fallback applies when absent > present but didn't clear the STILL_HERE bar above.
      else if (pre.kind === "SAVED") finalStatus = "RESOLVED_PRESENT";
      // ABSENT ("no está") is answered outright by the incumbent's GPS-validated "Sigo acá": the
      // seat stays theirs instead of lingering as "Dudoso" until they extend.
      else if (pre.kind === "ABSENT" && incumbentRespondedPresent) finalStatus = "RESOLVED_PRESENT";
      else finalStatus = "TIED";

      const claimed = await tx
        .update(schema.seatDisputes)
        .set({ status: finalStatus, resolvedAt: now })
        .where(and(eq(schema.seatDisputes.id, disputeId), eq(schema.seatDisputes.status, "OPEN")))
        .returning();
      if (claimed.length === 0) return null;

      if (finalStatus === "RESOLVED_ABSENT") {
        if (pre.checkInId) {
          const [checkIn] = await tx.select().from(schema.checkIns).where(eq(schema.checkIns.id, pre.checkInId)).limit(1);
          if (checkIn && checkIn.status === "ACTIVE") {
            // Conditional on still being ACTIVE: a concurrent checkout/sweep may have closed (and recorded) it already.
            const cancelled = await tx
              .update(schema.checkIns)
              .set({ status: "CANCELLED", endedAt: now, updatedAt: now })
              .where(and(eq(schema.checkIns.id, checkIn.id), eq(schema.checkIns.status, "ACTIVE")))
              .returning({ id: schema.checkIns.id });
            if (cancelled.length > 0) await this.studySessions.recordFromCheckIn(tx, checkIn, now);
          }
        }
        if (freeWeight != null) await this.applyFreeSignal(tx, pre, now, freeWeight);
      } else {
        // The room (or the incumbent) said the seat is not free: the "Está libre" reports on it are
        // overruled, so they can't keep it "Dudoso" against the "guardado"/"ocupado" ones.
        await this.expireFreeObservations(tx, pre.seatId, now);
      }

      return { finalStatus };
    });
    if (!resolved) return;

    await this.finalizeResolution(pre, resolved.finalStatus, now, null, openerRestricted);
  }

  /** Shared post-commit side effects: reputation hit, seat recompute (which is what actually
   *  records the `DISPUTE_RESOLVED` `seat_state_events` row, via `seatMetadata`), `SAVED`'s
   *  explicit source label, the realtime broadcasts, and — for a won CLAIM — the opener's
   *  `dispute:you-won` notification. Runs outside any transaction, like the rest of the app. */
  private async finalizeResolution(
    row: SeatDisputeRow,
    finalStatus: DisputeStatus,
    now: Date,
    actingUserId: string | null,
    openerRestricted: boolean,
    reason?: string,
  ): Promise<SeatStateChange[]> {
    if (finalStatus === "RESOLVED_PRESENT") {
      await this.reputation.incrementRejectedObservations(row.openerUserId);
      await this.securityEvents.record({ userId: row.openerUserId, eventType: "DISPUTE_LOST", metadata: { disputeId: row.id, seatId: row.seatId } });
    } else if (finalStatus === "TIED" && row.kind !== "SAVED") {
      // A TIED CLAIM/ABSENT is a milder miss than an outright loss — no reputation-weight
      // increment, just an audit trail (still nudges spam_score by 1 via `record`).
      await this.securityEvents.record({ userId: row.openerUserId, eventType: "DISPUTE_TIED", metadata: { disputeId: row.id, seatId: row.seatId } });
    }

    const changes = await this.roomState.recomputeSeats([row.seatId], {
      roomId: row.roomId,
      now,
      eventType: "DISPUTE_RESOLVED",
      actingUserId,
      seatMetadata: { [row.seatId]: { disputeId: row.id, kind: row.kind, status: finalStatus, ...(reason ? { reason } : {}) } },
    });

    if (row.kind === "SAVED" && finalStatus === "RESOLVED_ABSENT") {
      // Only while it actually reads FREE — a seat someone just checked into keeps its CHECK_IN source.
      await this.db
        .update(schema.seatCurrentState)
        .set({ sourceSummary: "SAVED" })
        .where(and(eq(schema.seatCurrentState.seatId, row.seatId), eq(schema.seatCurrentState.status, "FREE")));
    }

    await this.realtime.broadcastSeatChanges(row.roomId, changes);
    const dto = await this.toDtoById(row.id, null);
    this.realtime.emitDisputeResolved(row.roomId, stripPrivate(dto));

    // CLAIM win: the incumbent's check-in was just cancelled above, freeing the seat — but the
    // opener still has to self-check-in (fresh presence), same as anyone else claiming a free
    // seat. Skip the notification for a restricted opener, who couldn't check in anyway.
    if (row.kind === "CLAIM" && finalStatus === "RESOLVED_ABSENT" && !openerRestricted) {
      const [seat] = await this.db.select({ code: schema.seats.code }).from(schema.seats).where(eq(schema.seats.id, row.seatId)).limit(1);
      if (seat) {
        this.realtime.emitDisputeWon(row.openerUserId, { disputeId: row.id, seatId: row.seatId, seatCode: seat.code });
      }
    }

    // The vote (not the incumbent's own checkout/move/"Me fui") took the seat away: tell them.
    if (finalStatus === "RESOLVED_ABSENT" && !reason && row.incumbentUserId) {
      const incumbentUserId = row.incumbentUserId;
      const [seat] = await this.db.select({ code: schema.seats.code }).from(schema.seats).where(eq(schema.seats.id, row.seatId)).limit(1);
      if (seat) {
        runInBackground(this.logger, "seat lost push", () =>
          this.notifications.notifySeatChallenged({ userId: incumbentUserId, roomId: row.roomId, seatId: row.seatId, seatCode: seat.code, reason: "lost" }),
        );
      }
    }

    return changes;
  }

  /** Expires every still-live FREE observation on the seat (a vote just decided it isn't free). */
  private async expireFreeObservations(tx: Db, seatId: string, now: Date): Promise<void> {
    await tx
      .update(schema.seatObservations)
      .set({ expiresAt: now, updatedAt: now })
      .where(and(eq(schema.seatObservations.seatId, seatId), eq(schema.seatObservations.observedStatus, "FREE"), gt(schema.seatObservations.expiresAt, now)));
  }

  /** ABSENT/SAVED win: expires any active OCCUPIED/SAVED observations and writes a system FREE
   *  signal so the seat derives to FREE once no check-in holds it; for SAVED, `finalizeResolution`
   *  then overrides `sourceSummary` to `"SAVED"`. `weight` is the opener's current
   *  reputation-derived observation confidence weight — this is functionally equivalent to them
   *  filing a FREE observation. */
  private async applyFreeSignal(tx: Db, row: SeatDisputeRow, now: Date, weight: number): Promise<void> {
    await tx
      .update(schema.seatObservations)
      .set({ expiresAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.seatObservations.seatId, row.seatId),
          inArray(schema.seatObservations.observedStatus, ["OCCUPIED", "SAVED"]),
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
      confidenceWeight: weight,
      observedAt: now,
      expiresAt: new Date(now.getTime() + FREE_OBS_MINUTES * 60_000),
    });
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
