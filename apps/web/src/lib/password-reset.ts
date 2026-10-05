export const MIN_PASSWORD_LENGTH = 8;

export const RESET_REQUEST_NEUTRAL_MESSAGE = "Si el email tiene cuenta, te mandamos un link. Vence en 1 hora.";
export const RESET_LINK_INVALID_MESSAGE = "El link venció o ya se usó. Pedí uno nuevo.";
export const RATE_LIMITED_MESSAGE = "Demasiados intentos, probá en unos minutos";

/** Returns an error message for a bad new password / confirmation pair, or null when valid. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password !== confirm) return "Las contraseñas no coinciden.";
  return null;
}

/** Maps a Better Auth client error (or a missing/invalid `error` query param) to Argentine Spanish copy. */
export function resetErrorMessage(error: { code?: string; status?: number } | string): string {
  if (typeof error === "string") return error === "INVALID_TOKEN" ? RESET_LINK_INVALID_MESSAGE : "No pudimos restablecer la contraseña. Pedí un link nuevo.";
  if (error.status === 429) return RATE_LIMITED_MESSAGE;
  const code = error.code ?? "";
  if (code === "INVALID_TOKEN") return RESET_LINK_INVALID_MESSAGE;
  if (code === "PASSWORD_TOO_SHORT") return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (code === "PASSWORD_TOO_LONG") return "La contraseña es demasiado larga.";
  return "No pudimos restablecer la contraseña. Revisá tu conexión y probá de nuevo.";
}
