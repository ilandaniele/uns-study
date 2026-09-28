import { ApiRequestError } from "./api";
import { GeolocationRequestError } from "./geolocation";

/**
 * Maps a failure from a presence-sensitive action (check-in, observation, extend)
 * to the exact Spanish copy from 06_UI_UX_SPEC.md §6.
 */
export function describeActionError(error: unknown): string {
  if (error instanceof GeolocationRequestError) {
    if (error.code === "PERMISSION_DENIED") {
      return "Necesitamos tu ubicación sólo para comprobar que estás cerca de la sala. Podés seguir mirando el mapa sin compartirla.";
    }
    if (error.code === "TIMEOUT") {
      return "Tu ubicación no tiene suficiente precisión todavía. Probá de nuevo cerca de una ventana o esperá unos segundos.";
    }
    return "No pudimos obtener tu ubicación. Podés seguir mirando el mapa sin compartirla.";
  }

  if (error instanceof ApiRequestError) {
    if (error.code === "PRESENCE_REJECTED") {
      if (error.reason === "OUTSIDE_GEOFENCE" || error.reason === "ROOM_NOT_FOUND") {
        return "Parece que no estás en la sala. Podés mirar la disponibilidad, pero las actualizaciones están habilitadas sólo para personas presentes.";
      }
      if (error.reason === "POOR_ACCURACY" || error.reason === "STALE_LOCATION") {
        return "Tu ubicación no tiene suficiente precisión todavía. Probá de nuevo cerca de una ventana o esperá unos segundos.";
      }
      return "Parece que no estás en la sala. Podés mirar la disponibilidad, pero las actualizaciones están habilitadas sólo para personas presentes.";
    }
    if (error.code === "SEAT_TAKEN") {
      return "Ese lugar ya está ocupado por otra persona.";
    }
    if (error.code === "RATE_LIMITED") {
      return "Demasiadas acciones seguidas. Esperá un momento.";
    }
    if (error.code === "UNAUTHENTICATED") {
      return "Iniciá sesión para colaborar.";
    }
    if (error.code === "NO_ACTIVE_CHECKIN") {
      return "No encontramos un check-in activo tuyo.";
    }
    if (error.code === "SEAT_NOT_FOUND") {
      return "Ese lugar ya no existe.";
    }
    if (error.code === "OWN_SEAT_OBSERVATION") {
      return "Ya estás en este lugar. Usá “Me voy” si te fuiste.";
    }
    if (error.code === "TURNSTILE_REQUIRED") {
      return "Confirmá que sos una persona para continuar.";
    }
    if (error.code === "DISPUTE_NOT_ALLOWED") {
      return "No podés abrir esta votación para este lugar.";
    }
    if (error.code === "DISPUTE_ALREADY_OPEN") {
      return "Ya hay una votación en curso para este lugar.";
    }
    if (error.code === "DISPUTE_CLOSED") {
      return "Esta votación ya terminó.";
    }
  }

  return "No pudimos actualizar el lugar. Tu cambio no fue guardado.";
}
