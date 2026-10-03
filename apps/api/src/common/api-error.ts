import { HttpException } from "@nestjs/common";
import type { ApiErrorCode, PresenceDetails, PresenceRejectReason } from "@sala/contracts";

/** Thrown by domain services / controllers; rendered as `{ error: { code, message, reason? } }`. */
export class ApiException extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    status: number,
    public readonly reason?: PresenceRejectReason,
    public readonly details?: PresenceDetails,
  ) {
    super({ error: { code, message, ...(reason ? { reason } : {}), ...(details ? { details } : {}) } }, status);
  }
}

export const ApiErrors = {
  unauthenticated: () => new ApiException("UNAUTHENTICATED", "Iniciá sesión para continuar.", 401),
  presenceRejected: (reason: PresenceRejectReason, message: string, details?: PresenceDetails) =>
    new ApiException("PRESENCE_REJECTED", message, 403, reason, details),
  seatTaken: () => new ApiException("SEAT_TAKEN", "El asiento ya está ocupado.", 409),
  seatNotFound: () => new ApiException("SEAT_NOT_FOUND", "Asiento no encontrado.", 404),
  roomNotFound: () => new ApiException("SEAT_NOT_FOUND", "Sala no encontrada.", 404),
  noActiveCheckIn: () => new ApiException("NO_ACTIVE_CHECKIN", "No tenés un check-in activo.", 404),
  rateLimited: () => new ApiException("RATE_LIMITED", "Demasiados intentos, esperá un momento.", 429),
  featureDisabled: (message = "Esta función no está disponible en este momento.") => new ApiException("FEATURE_DISABLED", message, 503),
  validation: (message = "Datos inválidos.") => new ApiException("VALIDATION_ERROR", message, 400),
  ownSeatObservation: () =>
    new ApiException("OWN_SEAT_OBSERVATION", "Ya tenés un check-in activo en este asiento, usá 'Me voy' en vez de observar.", 409),
  turnstileRequired: () =>
    new ApiException("TURNSTILE_REQUIRED", "Confirmá que sos una persona para continuar.", 403),
  forbidden: (message = "No tenés permiso para hacer esto.") => new ApiException("FORBIDDEN", message, 403),
  notFound: (message = "No encontrado.") => new ApiException("NOT_FOUND", message, 404),
  blocked: () => new ApiException("BLOCKED", "No podés interactuar con este usuario.", 403),
  dmNotAllowed: () => new ApiException("DM_NOT_ALLOWED", "Este usuario no acepta mensajes directos.", 403),
  restricted: (message = "Tu cuenta tiene una restricción activa que te impide hacer esto.") =>
    new ApiException("RESTRICTED", message, 403),
  storageUnavailable: () =>
    new ApiException("STORAGE_UNAVAILABLE", "El almacenamiento de evidencia no está disponible en este momento.", 503),
  invalidQr: () => new ApiException("INVALID_QR", "Código QR inválido o vencido.", 404),
  disputeNotAllowed: (message = "No podés abrir una disputa en este asiento.") =>
    new ApiException("DISPUTE_NOT_ALLOWED", message, 409),
  disputeAlreadyOpen: () =>
    new ApiException("DISPUTE_ALREADY_OPEN", "Ya hay una disputa abierta para este asiento.", 409),
  disputeClosed: () => new ApiException("DISPUTE_CLOSED", "Esta disputa ya cerró.", 409),
  verifierUnavailable: () =>
    new ApiException("VERIFIER_UNAVAILABLE", "La verificación por foto no está disponible en este momento.", 503),
  seatVerified: () =>
    new ApiException("SEAT_VERIFIED", "Este lugar está verificado con foto: la persona está sentada acá.", 409),
  photoReused: () => new ApiException("PHOTO_REUSED", "Esta foto ya se usó para verificar otro check-in.", 409),
  photoInvalid: () => new ApiException("PHOTO_INVALID", "La foto no es válida.", 400),
  alreadyVerified: () =>
    new ApiException(
      "ALREADY_VERIFIED",
      "Ya verificaste este lugar. Para volver a verificar, marcá “Estoy acá” de nuevo cuando te sientes.",
      409,
    ),
  tableNameNotAllowed: () =>
    new ApiException("TABLE_NAME_NOT_ALLOWED", "Para proponer o votar tenés que haber marcado un lugar en la sala.", 403),
};
