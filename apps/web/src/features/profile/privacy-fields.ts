import type { PrivacySettingsDto } from "@uns/contracts";

export type PrivacyFieldKey = keyof PrivacySettingsDto;

export interface PrivacyFieldDef {
  key: PrivacyFieldKey;
  label: string;
  hint: string;
}

/**
 * Ordered list of privacy toggles rendered in `/perfil`, with the exact Spanish copy.
 * Pure data — kept out of the component so it's unit-testable and easy to reorder.
 */
export const PRIVACY_FIELDS: PrivacyFieldDef[] = [
  { key: "showFullName", label: "Mostrar nombre completo", hint: "Permite que tu nombre completo se use según tu modo de identidad." },
  { key: "showNickname", label: "Mostrar apodo", hint: "Permite que tu apodo se use según tu modo de identidad." },
  { key: "showCareer", label: "Mostrar carrera", hint: "Tu carrera aparece en tu perfil público." },
  { key: "showCurrentSubject", label: "Mostrar materia actual", hint: "La materia que estás cursando aparece en tu perfil público." },
  { key: "showInstagram", label: "Mostrar Instagram", hint: "Tu usuario de Instagram aparece en tu perfil público." },
  { key: "showStudentNumber", label: "Mostrar legajo", hint: "Tu número de legajo aparece en tu perfil público." },
  { key: "showAvatar", label: "Mostrar foto de perfil", hint: "Tu foto aparece en tu perfil y en la sala." },
  { key: "allowDirectMessages", label: "Permitir mensajes directos", hint: "Otras personas registradas pueden enviarte mensajes privados." },
  { key: "showAliasAnimalOnMap", label: "Mostrar mi animal en el mapa", hint: "Si está apagado, en el mapa aparecés con una silueta." },
  { key: "showInRanking", label: "Aparecer en el ranking", hint: "Con tu apodo si ocultás tu nombre." },
];
