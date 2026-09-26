import { Injectable } from "@nestjs/common";
import type { LocationInput, PresenceRejectReason, PresenceResult } from "@uns/contracts";
import { env } from "../env.js";

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

    const reject = (reason: PresenceRejectReason): PresenceResult => ({ valid: false, reason, expiresAt: null });

    const { latitude, longitude, accuracy, capturedAt } = location;
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
    const ageS = (now.getTime() - capturedAtMs) / 1000;
    if (ageS > maxAgeS || ageS < -5) {
      return reject("STALE_LOCATION");
    }

    if (accuracy > maxAccuracyM) {
      return reject("POOR_ACCURACY");
    }

    const distanceM = this.haversineDistanceM(room, { latitude, longitude });
    if (distanceM > room.geofenceRadiusM) {
      return reject("OUTSIDE_GEOFENCE");
    }

    return { valid: true, reason: null, expiresAt: new Date(now.getTime() + maxAgeS * 1000).toISOString() };
  }
}
