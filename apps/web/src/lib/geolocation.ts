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

/**
 * Requests a fresh (non-cached) device location for presence validation.
 * Never reuses a cached position (`maximumAge: 0`) since the server checks staleness.
 */
export function getFreshLocation(): Promise<LocationInput> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeolocationRequestError("UNAVAILABLE", "La geolocalización no está disponible en este dispositivo."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new GeolocationRequestError("PERMISSION_DENIED", "Permiso de ubicación denegado."));
        } else if (error.code === error.TIMEOUT) {
          reject(new GeolocationRequestError("TIMEOUT", "No pudimos obtener tu ubicación a tiempo."));
        } else {
          reject(new GeolocationRequestError("UNAVAILABLE", "No pudimos obtener tu ubicación."));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );
  });
}
