import { Injectable } from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { PRESENCE_GRANT_MINUTES, type LocationInput, type PresenceDetails, type PresenceRejectReason, type PresenceResult } from "@sala/contracts";
import { env } from "../env.js";
import { ApiErrors } from "../common/api-error.js";

export interface PresenceRoom {
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
}

export interface PresenceValidateOptions {
  /** Overrides the process env dev-bypass flag; used by tests. Ignored when `isProduction` is true. */
  devBypass?: boolean;
  isProduction?: boolean;
  maxAgeS?: number;
  maxAccuracyM?: number;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

const EARTH_RADIUS_M = 6_371_000;
/** Device clock may differ from the server's by up to this much before we distrust its timestamps. */
const MAX_CLOCK_SKEW_S = 15 * 60;
/** A fix slightly "from the future" is clock jitter, not tampering. */
const FUTURE_TOLERANCE_S = 30;
/** Cap on the reported accuracy credited on top of the geofence radius (50 m + 50 m = 100 m max). */
const MAX_ACCURACY_SLACK_M = 50;

/** Proof that presence was enforced for this request; services pass it on so it's checked once. */
export interface PresenceGrant {
  roomId: string;
  expiresAt: Date;
}

export interface RequirePresenceInput {
  userId: string;
  room: PresenceRoom & { id: string };
  /** The request's GPS fix, if it sent one. Without it only an unexpired grant is accepted. */
  location?: LocationInput | null;
  /** Presence already enforced earlier in this request; reused (no re-check) when it's for this room. */
  already?: PresenceGrant | null;
  /** Message for a rejected fix; defaults to {@link presenceMessage}. */
  rejectMessage?: string;
  /** Validation overrides (tests); `now` also dates the grant. */
  options?: PresenceValidateOptions;
}

@Injectable()
export class PresenceService {
  /** Great-circle distance between two lat/lng points, in meters. */
  haversineDistanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_M * c;
  }

  validate(room: PresenceRoom, location: LocationInput, options: PresenceValidateOptions = {}): PresenceResult {
    const isProduction = options.isProduction ?? env.isProduction;
    const devBypass = !isProduction && (options.devBypass ?? env.presenceDevBypass);
    const maxAgeS = options.maxAgeS ?? env.presenceMaxAgeS;
    const maxAccuracyM = options.maxAccuracyM ?? env.presenceMaxAccuracyM;
    const now = options.now ?? new Date();

    if (devBypass) {
      return { valid: true, reason: null, expiresAt: new Date(now.getTime() + maxAgeS * 1000).toISOString() };
    }

    const reject = (reason: PresenceRejectReason, details?: PresenceDetails): PresenceResult => {
      // Structured, coordinate-free log line so real-world rejections can be diagnosed from
      // `fly logs` (distance/accuracy/age only — never the user's position or id).
      console.info(
        JSON.stringify({
          evt: "presence_rejected",
          reason,
          distanceM: details?.distanceM ?? null,
          accuracyM: details?.accuracyM ?? null,
          allowedM: details?.allowedM ?? null,
          ageS: Number.isFinite(ageS) ? Math.round(ageS) : null,
          skewS: Number.isFinite(skewS) ? Math.round(skewS) : null,
        }),
      );
      return { valid: false, reason, expiresAt: null, ...(details ? { details } : {}) };
    };

    const { latitude, longitude, accuracy, capturedAt, sentAt } = location;
    let ageS = Number.NaN;
    let skewS = Number.NaN;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      !Number.isFinite(accuracy) ||
      accuracy < 0
    ) {
      return reject("INVALID_COORDINATES");
    }

    const capturedAtMs = Date.parse(capturedAt);
    if (!Number.isFinite(capturedAtMs)) {
      return reject("INVALID_COORDINATES");
    }
    // Measure the fix's age on the device's own clock when it tells us when it sent the request:
    // phones whose clock drifts from the server's would otherwise look stale (or "from the future").
    // The device clock itself must still be roughly right, so a replayed old request can't pass.
    const sentAtMs = sentAt ? Date.parse(sentAt) : Number.NaN;
    if (Number.isFinite(sentAtMs)) {
      skewS = (sentAtMs - now.getTime()) / 1000;
      ageS = (sentAtMs - capturedAtMs) / 1000;
      if (Math.abs(skewS) > MAX_CLOCK_SKEW_S) return reject("STALE_LOCATION");
    } else {
      ageS = (now.getTime() - capturedAtMs) / 1000;
    }
    if (ageS > maxAgeS || ageS < -FUTURE_TOLERANCE_S) {
      return reject("STALE_LOCATION");
    }

    // Indoor fixes are often off by tens of meters, so the reported accuracy (capped, so a wildly
    // inaccurate fix doesn't buy unlimited slack) is tolerated on top of the radius (50 m radius + 50 m
    // accuracy -> reading up to 100 m from the room center).
    const distanceM = this.haversineDistanceM(room, { latitude, longitude });
    const allowedM = room.geofenceRadiusM + Math.min(accuracy, MAX_ACCURACY_SLACK_M);
    const details: PresenceDetails = {
      distanceM: Math.round(distanceM),
      accuracyM: Math.round(accuracy),
      radiusM: room.geofenceRadiusM,
      allowedM: Math.round(allowedM),
    };

    if (accuracy > maxAccuracyM) {
      return reject("POOR_ACCURACY", details);
    }
    if (distanceM > allowedM) {
      return reject("OUTSIDE_GEOFENCE", details);
    }

    return { valid: true, reason: null, expiresAt: new Date(now.getTime() + maxAgeS * 1000).toISOString() };
  }

  /**
   * Enforces presence for a presence-sensitive write. A fix is validated against the geofence and,
   * when it passes, (re)issues the user's grant for this room for PRESENCE_GRANT_MINUTES; a request
   * without a fix is accepted only on an unexpired grant for the same user and room (a grant is
   * never extended without a new fix). Throws PRESENCE_REJECTED / PRESENCE_REQUIRED otherwise.
   * Takes `db` per call, like RoomCache, so this service stays constructible without one.
   */
  async requirePresence(db: Db, input: RequirePresenceInput): Promise<PresenceGrant> {
    if (input.already && input.already.roomId === input.room.id) return input.already;
    const now = input.options?.now ?? new Date();
    if (input.location) {
      const result = this.validate(input.room, input.location, input.options);
      if (!result.valid) {
        throw ApiErrors.presenceRejected(result.reason!, input.rejectMessage ?? presenceMessage(result.reason!), result.details);
      }
      return this.grant(db, input.userId, input.room.id, now);
    }

    const expiresAt = await this.grantExpiresAt(db, input.userId, input.room.id, now);
    if (!expiresAt) throw ApiErrors.presenceRequired();
    return { roomId: input.room.id, expiresAt };
  }

  /** Records that `userId` proved presence in `roomId` at `now`; only call after a valid fix. */
  async grant(db: Db, userId: string, roomId: string, now: Date = new Date()): Promise<PresenceGrant> {
    const expiresAt = new Date(now.getTime() + PRESENCE_GRANT_MINUTES * 60_000);
    await db
      .insert(schema.presenceGrants)
      .values({ userId, roomId, grantedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: [schema.presenceGrants.userId, schema.presenceGrants.roomId],
        set: { grantedAt: now, expiresAt },
      });
    return { roomId, expiresAt };
  }

  /** When the caller's grant for `roomId` runs out, or null without an unexpired one. */
  async grantExpiresAt(db: Db, userId: string, roomId: string, now: Date = new Date()): Promise<Date | null> {
    const [row] = await db
      .select({ expiresAt: schema.presenceGrants.expiresAt })
      .from(schema.presenceGrants)
      .where(and(eq(schema.presenceGrants.userId, userId), eq(schema.presenceGrants.roomId, roomId), gt(schema.presenceGrants.expiresAt, now)))
      .limit(1);
    return row?.expiresAt ?? null;
  }
}

export function presenceMessage(reason: string): string {
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
