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
