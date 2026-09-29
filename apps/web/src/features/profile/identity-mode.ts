import type { IdentityMode } from "@uns/contracts";

export const IDENTITY_MODES: IdentityMode[] = ["HIDDEN", "FIRST_NAME", "NICKNAME", "NICKNAME_AND_NAME", "FULL_NAME"];

/** Spanish label for the "¿Cómo te ven otras personas?" identity-mode selector in `/perfil`. */
export function identityModeLabel(mode: IdentityMode): string {
  switch (mode) {
    case "HIDDEN":
      return "Oculto (nadie ve tu nombre)";
    case "FIRST_NAME":
      return "Sólo tu nombre";
    case "NICKNAME":
      return "Sólo tu apodo";
    case "NICKNAME_AND_NAME":
      return "Apodo y nombre";
    case "FULL_NAME":
      return "Nombre completo";
  }
}

/** Short helper text shown under the selected identity mode. */
export function identityModeHint(mode: IdentityMode): string {
  if (mode === "HIDDEN") {
    return "Aparecés con un apodo divertido al azar, sin tu nombre.";
  }
  return "Este es el nombre que verán otras personas registradas cuando decidas mostrarte.";
}

/**
 * The name other people would see for `mode` given the name fields — mirrors the API's
 * `displayName` (visible modes only). `null` when the mode is HIDDEN or the fields it needs are empty.
 */
export function previewDisplayName(mode: IdentityMode, fields: { firstName: string; lastName: string; nickname: string }): string | null {
  const first = fields.firstName.trim();
  const last = fields.lastName.trim();
  const nickname = fields.nickname.trim();
  switch (mode) {
    case "FIRST_NAME":
      return first || nickname || null;
    case "FULL_NAME":
      return [first, last].filter(Boolean).join(" ") || null;
    case "NICKNAME":
      return nickname || null;
    case "NICKNAME_AND_NAME":
      return nickname && first ? `${nickname} (${first})` : nickname || first || null;
    case "HIDDEN":
      return null;
  }
}

/** True when a visible identity mode is chosen but the room-visibility privacy toggles are still off. */
export function needsRoomVisibility(mode: IdentityMode, privacy: { showInRoom: boolean; showSeat: boolean }): boolean {
  return mode !== "HIDDEN" && (!privacy.showInRoom || !privacy.showSeat);
}
