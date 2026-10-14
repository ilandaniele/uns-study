import type { MeDto } from "@sala/contracts";

export type ProLock = "unlocked" | "locked" | "unknown";

/** Pro = paying subscriber (same as ad-free). Nothing is locked while there is nothing to sell. */
export function proLockState(me: Pick<MeDto, "adFree" | "subscriptionsEnabled"> | null, loading: boolean): ProLock {
  // Without `me` we cannot know whether anything is on sale, so never lock (loading or failed fetch).
  if (!me || loading) return "unknown";
  if (me.adFree || !me.subscriptionsEnabled) return "unlocked";
  return "locked";
}

export type ProFeatureId = "focus_pip" | "focus_fullscreen" | "focus_sounds" | "focus_stats";

export const PRO_FEATURES: Record<ProFeatureId, { title: string; description: string }> = {
  focus_pip: { title: "Ventana flotante", description: "Tené el temporizador siempre a la vista mientras estudiás en otra pestaña." },
  focus_fullscreen: { title: "Pantalla completa", description: "Un temporizador grande y sin distracciones para concentrarte de verdad." },
  focus_sounds: { title: "Sonidos ambiente", description: "Lluvia, océano o fuego de fondo mientras corre cada bloque de foco." },
  focus_stats: { title: "Historial y racha", description: "Mirá tus últimos 7 días y tu racha para mantener el ritmo de estudio." },
};

export const PRO_BENEFITS: string[] = [
  "Sin anuncios en toda la app",
  "Ventana flotante del temporizador",
  "Pantalla completa en Foco",
  "Sonidos ambiente",
  "Historial y racha de estudio",
];
