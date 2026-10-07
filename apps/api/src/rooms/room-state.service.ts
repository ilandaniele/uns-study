import { Inject, Injectable } from "@nestjs/common";
import { and, eq, getTableColumns, gt, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import type { SeatStatus } from "@sala/contracts";
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
  /** When the seat's active check-in expires; `null`/absent without one. */
  occupiedUntil?: Date | null;
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

    // Sorted so every transaction takes its advisory locks in the same order (deadlock safety).
    const uniqueSeatIds = [...new Set(seatIds)].sort();
    if (uniqueSeatIds.length === 0) return changes;

    // Advisory locks, held for the rest of this transaction, serialize concurrent
    // read-compute-upsert cycles for the same seat (works under both Postgres and PGlite).
    // One statement; `order by u.o` keeps the sorted acquisition order.
    const seatIdList = sql.join(uniqueSeatIds.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(u.id)) from unnest(array[${seatIdList}]::text[]) with ordinality as u(id, o) order by u.o`);

    // One batched read per source for the whole seat set (after the locks, so it's consistent).
    // Awaited one at a time: `db` is a transaction (a single pg client), which cannot run queries concurrently.
    const [checkInRows, openRows, observationRows, previousRows] = [
      await db
        .select({
          seatId: schema.checkIns.seatId,
          id: schema.checkIns.id,
          updatedAt: schema.checkIns.updatedAt,
          verifiedAt: schema.checkIns.verifiedAt,
          expiresAt: schema.checkIns.expiresAt,
        })
        .from(schema.checkIns)
        .where(and(inArray(schema.checkIns.seatId, uniqueSeatIds), eq(schema.checkIns.status, "ACTIVE"))),
      await db
        .select({ seatId: schema.seatDisputes.seatId })
        .from(schema.seatDisputes)
        .where(and(inArray(schema.seatDisputes.seatId, uniqueSeatIds), eq(schema.seatDisputes.status, "OPEN"))),
      await db
        .select({
          seatId: schema.seatObservations.seatId,
          userId: schema.seatObservations.userId,
          status: schema.seatObservations.observedStatus,
          weight: schema.seatObservations.confidenceWeight,
          observedAt: schema.seatObservations.observedAt,
        })
        .from(schema.seatObservations)
        .where(and(inArray(schema.seatObservations.seatId, uniqueSeatIds), gt(schema.seatObservations.expiresAt, now))),
      await db.select().from(schema.seatCurrentState).where(inArray(schema.seatCurrentState.seatId, uniqueSeatIds)),
    ];

    const checkInBySeat = new Map<string, (typeof checkInRows)[number]>();
    for (const c of checkInRows) if (!checkInBySeat.has(c.seatId)) checkInBySeat.set(c.seatId, c);
    const openSeats = new Set(openRows.map((d) => d.seatId));
    const obsBySeat = new Map<string, typeof observationRows>();
    for (const o of observationRows) {
      const list = obsBySeat.get(o.seatId) ?? [];
      list.push(o);
      obsBySeat.set(o.seatId, list);
    }
    const previousBySeat = new Map(previousRows.map((r) => [r.seatId, r]));

    const tiedRows = checkInRows.length
      ? await db
          .select({ checkInId: schema.seatDisputes.checkInId, resolvedAt: schema.seatDisputes.resolvedAt })
          .from(schema.seatDisputes)
          .where(and(inArray(schema.seatDisputes.checkInId, checkInRows.map((c) => c.id)), eq(schema.seatDisputes.status, "TIED")))
      : [];
    const tiedResolvedAtByCheckIn = new Map<string, Date | null>();
    for (const t of tiedRows) if (t.checkInId != null && !tiedResolvedAtByCheckIn.has(t.checkInId)) tiedResolvedAtByCheckIn.set(t.checkInId, t.resolvedAt);

    for (const seatId of uniqueSeatIds) {
      const activeCheckIn = checkInBySeat.get(seatId);
      const verified = activeCheckIn ? isCheckInVerified(activeCheckIn.verifiedAt, new Date(activeCheckIn.expiresAt), now) : false;

      // An OPEN dispute always wins; otherwise a TIED dispute still linked to the seat's current
      // active check-in, unless the incumbent has extended since it tied (their check-in's
      // `updatedAt` moved past `resolvedAt`).
      let dispute: { status: "OPEN" | "TIED" } | null = null;
      if (openSeats.has(seatId)) dispute = { status: "OPEN" };
      else if (activeCheckIn) {
        const resolvedAt = tiedResolvedAtByCheckIn.get(activeCheckIn.id);
        if (resolvedAt && new Date(activeCheckIn.updatedAt).getTime() <= new Date(resolvedAt).getTime()) dispute = { status: "TIED" };
      }

      const result = calculateSeatState({
        hasActiveCheckIn: Boolean(activeCheckIn),
        observations: (obsBySeat.get(seatId) ?? []).map((o) => ({
          userId: o.userId,
          status: o.status,
          weight: o.weight,
          observedAt: new Date(o.observedAt),
        })),
        dispute,
      });

      const previous = previousBySeat.get(seatId);

      // `now` is captured by the caller *before* it waits on the advisory lock, so a slower writer
      // (e.g. a check-in) can carry an older stamp than a recompute that already ran for the same
      // seat (e.g. the expiration sweep). Clients merge by `lastUpdatedAt`, so the later write
      // (the truth in PostgreSQL) must always carry the strictly greater stamp.
      const prevStamp = previous ? new Date(previous.lastUpdatedAt).getTime() : null;
      const stamp = prevStamp !== null && prevStamp >= now.getTime() ? new Date(prevStamp + 1) : now;

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
          lastUpdatedAt: stamp,
          updatedAt: stamp,
        })
        .onConflictDoUpdate({
          target: schema.seatCurrentState.seatId,
          set: {
            status: result.status,
            confidence: result.confidence,
            sourceSummary: result.sourceSummary,
            lastUpdatedAt: stamp,
            updatedAt: stamp,
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
          createdAt: stamp,
        });
        changes.push({ seatId, status: result.status, confidence: result.confidence, lastUpdatedAt: stamp, verified, occupiedUntil: activeCheckIn ? new Date(activeCheckIn.expiresAt) : null, previousStatus: previous?.status ?? null });
      }
    }

    return changes;
  }

  /**
   * Live (non-persisted) seat states for a room map read: derives expiry lazily so a stale
   * `seat_current_state` row (not yet swept by the expiration job) never leaks to clients.
   * All the independent reads run in a single parallel batch.
   */
  async getLiveSeatStates(
    roomId: string,
    now: Date = new Date(),
    /** The room's active seats if the caller already loads them (skips re-selecting them). */
    loadedSeats?: { id: string }[] | Promise<{ id: string }[]>,
  ): Promise<Map<string, SeatStateChange & { sourceSummary: string; dispute: { id: string; closesAt: Date } | null; occupiedUntil: Date | null; changed: boolean }>> {
    const activeCheckInIds = this.db
      .select({ id: schema.checkIns.id })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE")));

    // Tied disputes are restricted (via subquery) to the current active check-ins, so historical
    // TIED rows are never scanned.
    const [seatRows, activeCheckIns, openDisputes, tiedDisputes, observationRows, storedRows] = await Promise.all([
      loadedSeats ??
        this.db.select({ id: schema.seats.id }).from(schema.seats).where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true))),
      this.db
        .select({
          seatId: schema.checkIns.seatId,
          id: schema.checkIns.id,
          updatedAt: schema.checkIns.updatedAt,
          verifiedAt: schema.checkIns.verifiedAt,
          expiresAt: schema.checkIns.expiresAt,
        })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE"))),
      this.db
        .select({ id: schema.seatDisputes.id, seatId: schema.seatDisputes.seatId, closesAt: schema.seatDisputes.closesAt })
        .from(schema.seatDisputes)
        .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "OPEN"))),
      this.db
        .select({ checkInId: schema.seatDisputes.checkInId, resolvedAt: schema.seatDisputes.resolvedAt })
        .from(schema.seatDisputes)
        .where(and(eq(schema.seatDisputes.roomId, roomId), eq(schema.seatDisputes.status, "TIED"), inArray(schema.seatDisputes.checkInId, activeCheckInIds))),
      this.db
        .select({
          seatId: schema.seatObservations.seatId,
          userId: schema.seatObservations.userId,
          status: schema.seatObservations.observedStatus,
          weight: schema.seatObservations.confidenceWeight,
          observedAt: schema.seatObservations.observedAt,
        })
        .from(schema.seatObservations)
        .where(and(eq(schema.seatObservations.roomId, roomId), gt(schema.seatObservations.expiresAt, now))),
      this.db
        .select(getTableColumns(schema.seatCurrentState))
        .from(schema.seatCurrentState)
        .innerJoin(schema.seats, eq(schema.seats.id, schema.seatCurrentState.seatId))
        .where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true))),
    ]);

    const seatIds = new Set(seatRows.map((s) => s.id));
    const checkedInSeats = new Set(activeCheckIns.map((c) => c.seatId));
    const checkInBySeat = new Map(
      activeCheckIns.map((c) => [c.seatId, { id: c.id, updatedAt: new Date(c.updatedAt), verifiedAt: c.verifiedAt, expiresAt: new Date(c.expiresAt) }]),
    );
    const openDisputeBySeat = new Map(openDisputes.map((d) => [d.seatId, d]));
    const tiedResolvedAtByCheckIn = new Map(
      tiedDisputes.filter((d): d is { checkInId: string; resolvedAt: Date | null } => d.checkInId != null).map((d) => [d.checkInId, d.resolvedAt]),
    );

    const obsBySeat = new Map<string, typeof observationRows>();
    for (const row of observationRows) {
      const list = obsBySeat.get(row.seatId) ?? [];
      list.push(row);
      obsBySeat.set(row.seatId, list);
    }

    const storedByseat = new Map(storedRows.map((r) => [r.seatId, r]));

    const result = new Map<
      string,
      SeatStateChange & { sourceSummary: string; dispute: { id: string; closesAt: Date } | null; occupiedUntil: Date | null; changed: boolean }
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
        occupiedUntil: checkIn ? checkIn.expiresAt : null,
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
    const summary = { roomId, total: 0, free: 0, occupied: 0, uncertain: 0, saved: 0, unknown: 0 };
    for (const state of liveStates.values()) {
      summary.total += 1;
      if (state.status === "FREE") summary.free += 1;
      else if (state.status === "OCCUPIED") summary.occupied += 1;
      else if (state.status === "UNCERTAIN") summary.uncertain += 1;
      else if (state.status === "SAVED") summary.saved += 1;
      else summary.unknown += 1;
    }
    return summary;
  }
}
