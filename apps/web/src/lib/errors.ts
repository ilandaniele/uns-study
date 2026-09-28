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
      const d = error.details;
      if (error.reason === "OUTSIDE_GEOFENCE" && d) {
        return `Tu teléfono te ubica a unos ${d.distanceM} m de la sala (margen ±${d.accuracyM} m) y aceptamos hasta ${d.allowedM} m. Si estás adentro, ${preciseLocationTip()} y probá de nuevo.`;
      }
      if (error.reason === "POOR_ACCURACY" && d) {
        return `Tu ubicación tiene un margen de ±${d.accuracyM} m, demasiado para confirmar que estás en la sala. ${capitalize(preciseLocationTip())} y probá de nuevo, mejor cerca de una ventana.`;
      }
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
    if (error.code === "SEAT_VERIFIED") {
      return "Este lugar está verificado con foto: la persona está sentada acá.";
    }
    if (error.code === "PHOTO_REUSED") {
      return "Esa foto ya se usó para verificar otro check-in. Sacá una foto nueva.";
    }
    if (error.code === "PHOTO_INVALID") {
      return "No pudimos leer esa foto. Probá sacarla de nuevo.";
    }
    if (error.code === "VERIFIER_UNAVAILABLE") {
      return "La verificación por foto no está disponible en este momento.";
    }
    if (error.code === "ALREADY_VERIFIED") {
      return "Ya verificaste este lugar. Para volver a verificar, marcá “Estoy acá” de nuevo cuando te sientes.";
    }
  }

  return "No pudimos actualizar el lugar. Tu cambio no fue guardado.";
}

/** Where to turn on precise location, worded for the visitor's platform. */
function preciseLocationTip(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "activá “Ubicación exacta” (Ajustes › Privacidad y seguridad › Localización › tu navegador)";
  }
  if (/Android/i.test(ua)) {
    return "activá “Usar ubicación precisa” en los permisos de ubicación del navegador";
  }
  return "activá la ubicación precisa del dispositivo";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
