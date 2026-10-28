import type { PrivacySettingsDto } from "@sala/contracts";

export type PrivacyFieldKey = keyof PrivacySettingsDto;

export interface PrivacyFieldDef {
  key: PrivacyFieldKey;
  label: string;
  hint: string;
  /** Only rendered for admins. */
  adminOnly?: boolean;
}

/**
 * Ordered list of privacy toggles rendered in `/perfil`, with the exact Spanish copy.
 * Pure data — kept out of the component so it's unit-testable and easy to reorder.
 */
export const PRIVACY_FIELDS: PrivacyFieldDef[] = [
  { key: "showAdminBadge", label: "Mostrar insignia de administración", hint: "Tu foto lleva la insignia de Admin o Superadmin que corresponda a tu cuenta.", adminOnly: true },
  { key: "showCareer", label: "Mostrar carrera", hint: "Tu carrera aparece en tu perfil público." },
  { key: "showCurrentSubject", label: "Mostrar materia actual", hint: "La materia que estás cursando aparece en tu perfil público." },
  { key: "showInstagram", label: "Mostrar Instagram", hint: "Mostrá un enlace a tu Instagram en tu perfil público." },
  { key: "showStudentNumber", label: "Mostrar legajo", hint: "Tu número de legajo aparece en tu perfil público." },
  { key: "showAvatar", label: "Mostrar foto de perfil", hint: "Tu foto aparece en tu perfil y en la sala." },
  { key: "allowDirectMessages", label: "Permitir mensajes directos", hint: "Otras personas registradas pueden enviarte mensajes privados." },
  { key: "showInPeopleSearch", label: "Aparecer en la búsqueda de personas", hint: "Te encuentran sólo por tu nombre o alias público. Tu email y los datos ocultos no se pueden buscar." },
  { key: "allowFriendRequests", label: "Recibir solicitudes de amistad", hint: "Vos decidís qué solicitudes aceptar. Ser amigos no habilita datos privados ni mensajes que hayas desactivado." },
  { key: "showAliasAnimalOnMap", label: "Mostrar mi animal en el mapa", hint: "Si está apagado, en el mapa aparecés con una silueta." },
  { key: "showInRanking", label: "Mostrar ranking, actividad e insignias", hint: "Si ocultás tu nombre, se muestran en un perfil con tu alias, sin revelar tu identidad. Apagalo para ocultar tu actividad e insignias públicas." },
];
