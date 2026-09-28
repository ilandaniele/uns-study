import type { LocationInput } from "@uns/contracts";

export type GeolocationErrorCode = "PERMISSION_DENIED" | "TIMEOUT" | "UNAVAILABLE";

export class GeolocationRequestError extends Error {
  code: GeolocationErrorCode;

  constructor(code: GeolocationErrorCode, message: string) {
    super(message);
    this.name = "GeolocationRequestError";
    this.code = code;
  }
}

/** Stop sampling as soon as a fix is at least this precise (meters). */
const GOOD_ENOUGH_ACCURACY_M = 25;
/** Longest time spent collecting fixes before settling for the best one. */
const SAMPLE_WINDOW_MS = 8_000;

/**
 * Requests a fresh (non-cached) device location for presence validation.
 *
 * Indoors the first fix is often a coarse Wi-Fi/cell estimate (80-150 m). Instead of taking it,
 * this watches the position for up to {@link SAMPLE_WINDOW_MS} and keeps the most precise
 * reading, returning early once one is good enough. Never reuses a cached position
 * (`maximumAge: 0`) since the server checks staleness.
 */
export function getFreshLocation(): Promise<LocationInput> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeolocationRequestError("UNAVAILABLE", "La geolocalización no está disponible en este dispositivo."));
      return;
    }

    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(windowTimer);
      if (best) {
        resolve({
          latitude: best.coords.latitude,
          longitude: best.coords.longitude,
          accuracy: best.coords.accuracy,
          capturedAt: new Date(best.timestamp).toISOString(),
          // Sent alongside so the server can measure the fix's age on this device's clock.
          sentAt: new Date().toISOString(),
        });
      } else {
        reject(new GeolocationRequestError("TIMEOUT", "No pudimos obtener tu ubicación a tiempo."));
      }
    };

    // No fix at all within the window: wait a little longer for the first one, then give up.
    const windowTimer = setTimeout(() => {
      if (best) finish();
      else setTimeout(finish, 7_000);
    }, SAMPLE_WINDOW_MS);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        if (position.coords.accuracy <= GOOD_ENOUGH_ACCURACY_M) finish();
      },
      (error) => {
        if (settled) return;
        if (error.code === error.PERMISSION_DENIED) {
          settled = true;
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          clearTimeout(windowTimer);
          reject(new GeolocationRequestError("PERMISSION_DENIED", "Permiso de ubicación denegado."));
        } else if (best) {
          finish();
        }
        // Transient TIMEOUT/UNAVAILABLE without any fix yet: keep watching until the window ends.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );
  });
}
