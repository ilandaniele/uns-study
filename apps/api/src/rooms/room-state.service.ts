import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@uns/database";
import type { SeatStatus } from "@uns/contracts";
import { DB } from "../database/database.module.js";
import { calculateSeatState } from "./seat-state-calculator.js";

export interface SeatStateChange {
  seatId: string;
  status: SeatStatus;
  confidence: number;
  lastUpdatedAt: Date;
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
    opts: { roomId: string; now?: Date; eventType: string; actingUserId?: string | null; tx?: Db } = {
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
    opts: { roomId: string; now?: Date; eventType: string; actingUserId?: string | null },
  ): Promise<SeatStateChange[]> {
    const now = opts.now ?? new Date();
    const changes: SeatStateChange[] = [];

    for (const seatId of [...new Set(seatIds)]) {
      // Advisory lock, held for the rest of this transaction, serializes concurrent
      // read-compute-upsert cycles for the same seat (works under both Postgres and PGlite).
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${seatId}))`);

      const [activeCheckIn] = await db
        .select({ id: schema.checkIns.id })
        .from(schema.checkIns)
        .where(and(eq(schema.checkIns.seatId, seatId), eq(schema.checkIns.status, "ACTIVE")))
        .limit(1);

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
      });

      const [previous] = await db
        .select()
        .from(schema.seatCurrentState)
        .where(eq(schema.seatCurrentState.seatId, seatId))
        .limit(1);

      const changed = !previous || previous.status !== result.status || previous.confidence !== result.confidence;

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
          metadata: { confidence: result.confidence, sourceSummary: result.sourceSummary },
          createdAt: now,
        });
        changes.push({ seatId, status: result.status, confidence: result.confidence, lastUpdatedAt: now });
      }
    }

    return changes;
  }

  /**
   * Live (non-persisted) seat states for a room map read: derives expiry lazily so a stale
   * `seat_current_state` row (not yet swept by the expiration job) never leaks to clients.
   */
  async getLiveSeatStates(
    roomId: string,
    now: Date = new Date(),
  ): Promise<Map<string, SeatStateChange & { sourceSummary: string }>> {
    const seatRows = await this.db.select({ id: schema.seats.id }).from(schema.seats).where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true)));
    const seatIds = new Set(seatRows.map((s) => s.id));

    const activeCheckIns = await this.db
      .select({ seatId: schema.checkIns.seatId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.roomId, roomId), eq(schema.checkIns.status, "ACTIVE")));
    const checkedInSeats = new Set(activeCheckIns.map((c) => c.seatId));

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

    const result = new Map<string, SeatStateChange & { sourceSummary: string }>();
    for (const seatId of seatIds) {
      const live = calculateSeatState({
        hasActiveCheckIn: checkedInSeats.has(seatId),
        observations: (obsBySeat.get(seatId) ?? []).map((o) => ({
          userId: o.userId,
          status: o.status,
          weight: o.weight,
          observedAt: new Date(o.observedAt),
        })),
      });
      const stored = storedByseat.get(seatId);
      const changed = !stored || stored.status !== live.status || stored.confidence !== live.confidence;
      result.set(seatId, {
        seatId,
        status: live.status,
        confidence: live.confidence,
        sourceSummary: live.sourceSummary,
        lastUpdatedAt: changed ? now : new Date(stored!.lastUpdatedAt),
      });
    }
    return result;
  }

  async getRoomSummary(roomId: string) {
    const rows = await this.db
      .select({ status: schema.seatCurrentState.status, value: sql<number>`count(*)` })
      .from(schema.seatCurrentState)
      .innerJoin(schema.seats, eq(schema.seats.id, schema.seatCurrentState.seatId))
      .where(and(eq(schema.seats.roomId, roomId), eq(schema.seats.active, true)))
      .groupBy(schema.seatCurrentState.status);

    const summary = { roomId, total: 0, free: 0, occupied: 0, uncertain: 0, unknown: 0 };
    for (const row of rows) {
      const n = Number(row.value);
      summary.total += n;
      if (row.status === "FREE") summary.free = n;
      else if (row.status === "OCCUPIED") summary.occupied = n;
      else if (row.status === "UNCERTAIN") summary.uncertain = n;
      else summary.unknown = n;
    }
    return summary;
  }
}
