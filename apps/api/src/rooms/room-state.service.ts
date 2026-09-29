import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { SeatStatus } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { calculateSeatState } from "./seat-state-calculator.js";
import { isCheckInVerified } from "../checkins/verification.js";

export interface SeatStateChange {
  seatId: string;
  status: SeatStatus;
  confidence: number;
  lastUpdatedAt: Date;
  /** Whether the seat's active check-in currently has unexpired photo-verification protection. */
  verified: boolean;
  /** The seat's persisted status right before this recompute, or `null` if it had none yet (never
   *  persisted / a brand-new seat) — lets subscribers (e.g. `NotificationService`) tell a seat
   *  freeing up (OCCUPIED/UNCERTAIN -> FREE) apart from any other kind of change. Only populated by
   *  `recomputeSeats` (an actual diff) — `undefined` from `getLiveSeatStates`, which has no "before". */
  previousStatus?: SeatStatus | null;
}

/**
 * Recomputes and persists `seat_current_state` from the canonical sources (active check-ins,
 * active observations) and records an append-only `seat_state_events` row per change.
 */
@Injectable()
export class RoomStateService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Recomputes the given seats (within `tx` if provided, else the module db) and returns only the
   * seats whose persisted status/confidence actually changed — callers use this to decide what to
   * broadcast over the realtime gateway.
   */
  async recomputeSeats(
    seatIds: string[],
    opts: {
      roomId: string;
      now?: Date;
      eventType: string;
      actingUserId?: string | null;
      tx?: Db;
      /** Extra per-seat metadata merged into that seat's `seat_state_events` row, e.g. `{ qrVerified: true }`. */
      seatMetadata?: Record<string, Record<string, unknown>>;
    } = {
      roomId: "",
      eventType: "RECOMPUTE",
    },
  ): Promise<SeatStateChange[]> {
    // Reuse the caller's transaction if it already opened one; otherwise open our own so the
    // per-seat advisory locks below actually serialize concurrent recomputes of the same seat.
    if (opts.tx) return this.recomputeSeatsLocked(opts.tx, seatIds, opts);
    return this.db.transaction((tx) => this.recomputeSeatsLocked(tx, seatIds, opts));
  }

  private async recomputeSeatsLocked(
    db: Db,
    seatIds: string[],
    opts: {
      roomId: string;
      now?: Date;
      eventType: string;
      actingUserId?: string | null;
      seatMetadata?: Record<string, Record<string, unknown>>;
    },
  ): Promise<SeatStateChange[]> {
    const now = opts.now ?? new Date();
    const changes: SeatStateChange[] = [];

    for (const seatId of [...new Set(seatIds)]) {
      // Advisory lock, held for the rest of this transaction, serializes concurrent
      // read-compute-upsert cycles for the same seat (works under both Postgres and PGlite).
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${seatId}))`);

      const [activeCheckIn] = await db
        .select({
          id: schema.checkIns.id,
          updatedAt: schema.checkIns.updatedAt,
          verifiedAt: schema.checkIns.verifiedAt,
          expiresAt: schema.checkIns.expiresAt,
        })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.seatId, seatId), eq(schema.checkIns.status, "ACTIVE")))
        .limit(1);
      const verified = activeCheckIn ? isCheckInVerified(activeCheckIn.verifiedAt, new Date(activeCheckIn.expiresAt), now) : false;

      const dispute = await this.loadDisputeSignal(db, seatId, activeCheckIn);

      const observationRows = await db
        .select({
          userId: schema.seatObservations.userId,
          status: schema.seatObservations.observedStatus,
          weight: schema.seatObservations.confidenceWeight,
          observedAt: schema.seatObservations.observedAt,
        })
        .from(schema.seatObservations)
        .where(and(eq(schema.seatObservations.seatId, seatId), gt(schema.seatObservations.expiresAt, now)));

      const result = calculateSeatState({
        hasActiveCheckIn: Boolean(activeCheckIn),
        observations: observationRows.map((o) => ({
          userId: o.userId,
          status: o.status,
          weight: o.weight,
          observedAt: new Date(o.observedAt),
        })),
        dispute,
      });

      const [previous] = await db
        .select()
        .from(schema.seatCurrentState)
        .where(eq(schema.seatCurrentState.seatId, seatId))
        .limit(1);

      // `seat_current_state` doesn't persist `verified` (it's derived fresh from the active
      // check-in each time), so a verification-only change can't be detected by diffing it against
      // `previous` — the PHOTO_VERIFIED event type itself is the signal that something changed.
      const changed =
        !previous || previous.status !== result.status || previous.confidence !== result.confidence || opts.eventType === "PHOTO_VERIFIED";

      await db
        .insert(schema.seatCurrentState)
        .values({
          seatId,
          status: result.status,
          confidence: result.confidence,
          sourceSummary: result.sourceSummary,
          lastUpdatedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.seatCurrentState.seatId,
          set: {
            status: result.status,
            confidence: result.confidence,
            sourceSummary: result.sourceSummary,
            lastUpdatedAt: now,
            updatedAt: now,
          },
        });

      if (changed) {
        await db.insert(schema.seatStateEvents).values({
          roomId: opts.roomId,
          seatId,
          userId: opts.actingUserId ?? null,
          eventType: opts.eventType,
          oldStatus: previous?.status ?? null,
          newStatus: result.status,
          metadata: { confidence: result.confidence, sourceSummary: result.sourceSummary, ...(opts.seatMetadata?.[seatId] ?? {}) },
          createdAt: now,
        });
        changes.push({ seatId, status: result.status, confidence: result.confidence, lastUpdatedAt: now, verified, previousStatus: previous?.status ?? null });
      }
    }

    return changes;
  }

  /**
   * Loads the dispute signal `SeatStateCalculator` needs for one seat: an OPEN dispute always
   * wins; otherwise a TIED dispute still linked to the seat's current active check-in, unless the
   * incumbent has extended since it tied (their check-in's `updatedAt` moved past `resolvedAt`).
   */
  private async loadDisputeSignal(
    db: Db,
    seatId: string,
    activeCheckIn: { id: string; updatedAt: Date } | undefined,
  ): Promise<{ status: "OPEN" | "TIED" } | null> {
    const [open] = await db
      .select({ id: schema.seatDisputes.id })
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.seatId, seatId), eq(schema.seatDisputes.status, "OPEN")))
      .limit(1);
    if (open) return { status: "OPEN" };
    if (!activeCheckIn) return null;

    const [tied] = await db
      .select({ resolvedAt: schema.seatDisputes.resolvedAt })
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.checkInId, activeCheckIn.id), eq(schema.seatDisputes.status, "TIED")))
      .limit(1);
    if (tied?.resolvedAt && new Date(activeCheckIn.updatedAt).getTime() <= new Date(tied.resolvedAt).getTime()) {
      return { status: "TIED" };
    }
    return null;
  }

  /**
   * Live (non-persisted) seat states for a room map read: derives expiry lazily so a stale
   * `seat_current_state` row (not yet swept by the expiration job) never leaks to clients.
   */
  async getLiveSeatStates(
    roomId: string,
    now: Date = new Date(),
  ): Promise<Map<string, SeatStateChange & { sourceSummary: string; dispute: { id: string; closesAt: Date } | null; changed: boolean }>> {
    const seatRows = await this.db.select({ id: schema.seats.id }).from(schema.seats).where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true)));
    const seatIds = new Set(seatRows.map((s) => s.id));

    const activeCheckIns = await this.db
      .select({
        seatId: schema.checkIns.seatId,
        id: schema.checkIns.id,
        updatedAt: schema.checkIns.updatedAt,
        verifiedAt: schema.checkIns.verifiedAt,
        expiresAt: schema.checkIns.expiresAt,
      })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE")));
    const checkedInSeats = new Set(activeCheckIns.map((c) => c.seatId));
    const checkInBySeat = new Map(
      activeCheckIns.map((c) => [c.seatId, { id: c.id, updatedAt: new Date(c.updatedAt), verifiedAt: c.verifiedAt, expiresAt: new Date(c.expiresAt) }]),
    );

    const openDisputes = await this.db
      .select({ id: schema.seatDisputes.id, seatId: schema.seatDisputes.seatId, closesAt: schema.seatDisputes.closesAt })
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "OPEN")));
    const openDisputeBySeat = new Map(openDisputes.map((d) => [d.seatId, d]));

    const tiedDisputes = await this.db
      .select({ checkInId: schema.seatDisputes.checkInId, resolvedAt: schema.seatDisputes.resolvedAt })
      .from(schema.seatDisputes)
      .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "TIED")));
    const tiedResolvedAtByCheckIn = new Map(
      tiedDisputes.filter((d): d is { checkInId: string; resolvedAt: Date | null } => d.checkInId != null).map((d) => [d.checkInId, d.resolvedAt]),
    );

    const observationRows = await this.db
      .select({
        seatId: schema.seatObservations.seatId,
        userId: schema.seatObservations.userId,
        status: schema.seatObservations.observedStatus,
        weight: schema.seatObservations.confidenceWeight,
        observedAt: schema.seatObservations.observedAt,
      })
      .from(schema.seatObservations)
      .where(and(eq(schema.seatObservations.roomId, roomId), gt(schema.seatObservations.expiresAt, now)));

    const obsBySeat = new Map<string, typeof observationRows>();
    for (const row of observationRows) {
      const list = obsBySeat.get(row.seatId) ?? [];
      list.push(row);
      obsBySeat.set(row.seatId, list);
    }

    const seatIdList = [...seatIds];
    const storedRows = seatIdList.length
      ? await this.db.select().from(schema.seatCurrentState).where(inArray(schema.seatCurrentState.seatId, seatIdList))
      : [];
    const storedByseat = new Map(storedRows.map((r) => [r.seatId, r]));

    const result = new Map<
      string,
      SeatStateChange & { sourceSummary: string; dispute: { id: string; closesAt: Date } | null; changed: boolean }
    >();
    for (const seatId of seatIds) {
      const openDispute = openDisputeBySeat.get(seatId);
      const checkIn = checkInBySeat.get(seatId);
      let dispute: { status: "OPEN" | "TIED" } | null = openDispute ? { status: "OPEN" } : null;
      if (!dispute && checkIn) {
        const tiedResolvedAt = tiedResolvedAtByCheckIn.get(checkIn.id);
        if (tiedResolvedAt && checkIn.updatedAt.getTime() <= new Date(tiedResolvedAt).getTime()) {
          dispute = { status: "TIED" };
        }
      }

      const live = calculateSeatState({
        hasActiveCheckIn: checkedInSeats.has(seatId),
        observations: (obsBySeat.get(seatId) ?? []).map((o) => ({
          userId: o.userId,
          status: o.status,
          weight: o.weight,
          observedAt: new Date(o.observedAt),
        })),
        dispute,
      });
      const stored = storedByseat.get(seatId);
      const changed = !stored || stored.status !== live.status || stored.confidence !== live.confidence;
      const verified = checkIn ? isCheckInVerified(checkIn.verifiedAt, checkIn.expiresAt, now) : false;
      result.set(seatId, {
        seatId,
        status: live.status,
        confidence: live.confidence,
        sourceSummary: live.sourceSummary,
        lastUpdatedAt: changed ? now : new Date(stored!.lastUpdatedAt),
        dispute: openDispute ? { id: openDispute.id, closesAt: new Date(openDispute.closesAt) } : null,
        verified,
        changed,
      });
    }
    return result;
  }

  /**
   * Seats whose persisted `seat_current_state` disagrees with what `getLiveSeatStates` derives
   * right now — i.e. a signal (check-in or observation) expired since the last successful sweep
   * but hasn't been reconciled yet. Recomputing exactly this set is what lets the expiration job
   * catch up correctly after being stopped for any length of time, rather than only looking back a
   * fixed window from `now`.
   */
  async findMismatchedSeats(roomId: string, now: Date = new Date()): Promise<string[]> {
    const live = await this.getLiveSeatStates(roomId, now);
    return [...live.values()].filter((s) => s.changed).map((s) => s.seatId);
  }

  /**
   * Seat-status counts for a room, derived the same way the live map is (`getLiveSeatStates`) so a
   * `room:summary-changed` broadcast can never disagree with what `seat:state-changed` events (and
   * a fresh map fetch) show — unlike reading `seat_current_state` directly, this can't be stale
   * while a signal has expired but not yet been swept.
   */
  async getRoomSummary(roomId: string) {
    const liveStates = await this.getLiveSeatStates(roomId);
    const summary = { roomId, total: 0, free: 0, occupied: 0, uncertain: 0, unknown: 0 };
    for (const state of liveStates.values()) {
      summary.total += 1;
      if (state.status === "FREE") summary.free += 1;
      else if (state.status === "OCCUPIED") summary.occupied += 1;
      else if (state.status === "UNCERTAIN") summary.uncertain += 1;
      else summary.unknown += 1;
    }
    return summary;
  }
}
