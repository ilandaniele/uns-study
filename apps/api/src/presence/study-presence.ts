import { and, eq, inArray } from "drizzle-orm";
import { inChunks, schema, type Db, type Tx } from "@sala/database";
import { STUDY_ABSENCE_RELEASE_MS, STUDY_PRESENCE_LEASE_MS, type LocationInput, type StudyPresenceDto } from "@sala/contracts";
import { PresenceService, type PresenceRoom } from "./presence.service.js";

type Store = Db | Tx;
type Stay = { id: string; startedAt: Date | string; expiresAt: Date | string; settled?: boolean };
export type StudyPart = { startedAt: Date; minutes: number };

export function studyDeviceId(value: string | undefined): string | null {
  return value && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value) ? value : null;
}

export function beginStudyPresence(tx: Store, checkInId: string, now: Date, deviceId: string | null = null): void {
  tx.insert(schema.checkInMonitors).values({ checkInId, countingFrom: now, verifiedUntil: new Date(+now + STUDY_PRESENCE_LEASE_MS), lastSampleAt: now, deviceId }).onConflictDoNothing().run();
}

export function presenceDto(row: typeof schema.checkInMonitors.$inferSelect, now: Date, released = false): StudyPresenceDto {
  return { checkInId: row.checkInId, state: released ? "RELEASED" : row.outsideSince ? "AWAY" : row.countingFrom && row.verifiedUntil > now ? "COUNTING" : "PAUSED",
    verifiedUntil: row.verifiedUntil.toISOString(), releaseAt: row.outsideSince ? new Date(+row.outsideSince + STUDY_ABSENCE_RELEASE_MS).toISOString() : null };
}

/** Server and device freshness, and the entire accuracy circle, are considered. */
export function classifyStudyLocation(room: PresenceRoom, location: LocationInput, now: Date): "INSIDE" | "OUTSIDE" | "UNKNOWN" {
  const captured = Date.parse(location.capturedAt), sent = Date.parse(location.sentAt ?? location.capturedAt);
  if (!Number.isFinite(captured) || !Number.isFinite(sent) || +now - captured > 45_000 || captured > +now + 5_000 || sent - captured > 45_000 || sent < captured || Math.abs(+now - sent) > 45_000 || location.accuracy <= 0 || location.accuracy > 80) return "UNKNOWN";
  const distance = new PresenceService().haversineDistanceM(room, location);
  if (distance - location.accuracy > 50) return "OUTSIDE";
  return distance + location.accuracy <= Math.min(50, room.geofenceRadiusM) ? "INSIDE" : "UNKNOWN";
}

/** Called inside the same transaction that checked ownership and ACTIVE status. */
export function sampleStudyPresence(tx: Store, checkInId: string, room: PresenceRoom, location: LocationInput, now: Date, deviceId: string | null = null): StudyPresenceDto {
  beginStudyPresence(tx, checkInId, now);
  const row = tx.select().from(schema.checkInMonitors).where(eq(schema.checkInMonitors.checkInId, checkInId)).get()!;
  const sampleAt = new Date(location.capturedAt);
  if (sampleAt <= row.lastSampleAt) return presenceDto(row, now);
  const classification = classifyStudyLocation(room, location, now);
  if (classification === "UNKNOWN") return presenceDto(row, now);
  // Old stays without a browser binding can only be adopted by a device actually inside.
  if (!row.deviceId && deviceId && classification !== "INSIDE") return { ...presenceDto(row, now), trackingHere: false };
  const close = (end: Date) => {
    if (row.countingFrom && end > row.countingFrom) tx.insert(schema.checkInStudySpans).values({ checkInId, startedAt: row.countingFrom, endedAt: end }).run();
  };
  if (classification === "OUTSIDE") {
    const end = new Date(Math.min(+now, +sampleAt, +row.verifiedUntil));
    close(end);
    const updated = tx.update(schema.checkInMonitors).set({ countingFrom: null, verifiedUntil: end, outsideSince: row.outsideSince ?? now, lastSampleAt: sampleAt }).where(eq(schema.checkInMonitors.checkInId, checkInId)).returning().get()!;
    if (!row.outsideSince) {
      const stay = tx.select({ userId: schema.checkIns.userId, roomId: schema.checkIns.roomId }).from(schema.checkIns).where(eq(schema.checkIns.id, checkInId)).get()!;
      tx.delete(schema.presenceGrants).where(and(eq(schema.presenceGrants.userId, stay.userId), eq(schema.presenceGrants.roomId, stay.roomId))).run();
    }
    return presenceDto(updated, now);
  }
  // An unobserved gap is never filled retrospectively, including after a locked phone returns.
  const gap = !row.countingFrom || row.verifiedUntil < now;
  if (gap && row.countingFrom) close(row.verifiedUntil);
  const updated = tx.update(schema.checkInMonitors).set({ countingFrom: gap ? now : row.countingFrom, verifiedUntil: new Date(+now + STUDY_PRESENCE_LEASE_MS), outsideSince: null, lastSampleAt: sampleAt, deviceId: row.deviceId ?? deviceId }).where(eq(schema.checkInMonitors.checkInId, checkInId)).returning().get()!;
  return presenceDto(updated, now);
}

/** Batched shared accounting for live rankings, history, seeds and finalized check-ins. */
export function monitoredStudyParts(db: Store, stays: readonly Stay[], now: Date): Map<string, StudyPart[]> {
  const result = new Map<string, StudyPart[]>();
  if (!stays.length) return result;
  const ids = stays.map(c => c.id);
  const monitors = inChunks(ids, part => db.select().from(schema.checkInMonitors).where(inArray(schema.checkInMonitors.checkInId, part)).all());
  if (!monitors.length) return result;
  const spans = inChunks(monitors.map(m => m.checkInId), part => db.select().from(schema.checkInStudySpans).where(inArray(schema.checkInStudySpans.checkInId, part)).all());
  const spansByStay = new Map<string, { start: number; end: number }[]>();
  for (const span of spans) {
    const group = spansByStay.get(span.checkInId) ?? [];
    group.push({ start: +span.startedAt, end: +span.endedAt }); spansByStay.set(span.checkInId, group);
  }
  const byId = new Map(stays.map(c => [c.id, c]));
  for (const monitor of monitors) {
    const stay = byId.get(monitor.checkInId)!;
    const start = +new Date(stay.startedAt), end = Math.min(stay.settled ? Infinity : +now, +new Date(stay.expiresAt));
    const intervals = spansByStay.get(monitor.checkInId) ?? [];
    if (monitor.countingFrom) intervals.push({ start: +monitor.countingFrom, end: +monitor.verifiedUntil });
    intervals.sort((a,b) => a.start - b.start);
    const parts: StudyPart[] = []; let totalMs = 0, totalMinutes = 0;
    for (const interval of intervals) {
      const from = Math.max(start, interval.start), until = Math.min(end, interval.end);
      if (until <= from || totalMinutes >= 720) continue;
      totalMs += until - from;
      const minutes = Math.min(720, Math.floor(totalMs / 60_000)) - totalMinutes;
      if (minutes > 0) parts.push({ startedAt: new Date(from), minutes });
      totalMinutes += minutes;
    }
    result.set(monitor.checkInId, totalMinutes >= 5 ? parts : []);
  }
  return result;
}
