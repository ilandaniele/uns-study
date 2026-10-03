import { ANIMALS } from "@sala/contracts";

/**
 * Generates fun, random, family-friendly Spanish aliases ("Carpincho Estudioso", "Puma Filosófico")
 * shown instead of "Usuario anónimo" for hidden users. Pairs an Argentine animal from the shared
 * catalog (`ANIMALS`, which also drives the map illustration) with a study-themed adjective,
 * agreeing gender (masculine/feminine) between the two.
 */

export interface Adjective {
  masc: string;
  fem: string;
}

/** >=60 study-themed adjectives, masculine/feminine forms (invariable adjectives repeat the same form). */
export const ADJECTIVES: Adjective[] = [
  { masc: "Estudioso", fem: "Estudiosa" },
  { masc: "Concentrado", fem: "Concentrada" },
  { masc: "Aplicado", fem: "Aplicada" },
  { masc: "Dedicado", fem: "Dedicada" },
  { masc: "Perseverante", fem: "Perseverante" },
  { masc: "Madrugador", fem: "Madrugadora" },
  { masc: "Nocturno", fem: "Nocturna" },
  { masc: "Curioso", fem: "Curiosa" },
  { masc: "Metódico", fem: "Metódica" },
  { masc: "Prolijo", fem: "Prolija" },
  { masc: "Filosófico", fem: "Filosófica" },
  { masc: "Matemático", fem: "Matemática" },
  { masc: "Creativo", fem: "Creativa" },
  { masc: "Enfocado", fem: "Enfocada" },
  { masc: "Meticuloso", fem: "Meticulosa" },
  { masc: "Constante", fem: "Constante" },
  { masc: "Tenaz", fem: "Tenaz" },
  { masc: "Disciplinado", fem: "Disciplinada" },
  { masc: "Brillante", fem: "Brillante" },
  { masc: "Inquieto", fem: "Inquieta" },
  { masc: "Reflexivo", fem: "Reflexiva" },
  { masc: "Analítico", fem: "Analítica" },
  { masc: "Voluntarioso", fem: "Voluntariosa" },
  { masc: "Organizado", fem: "Organizada" },
  { masc: "Ingenioso", fem: "Ingeniosa" },
  { masc: "Paciente", fem: "Paciente" },
  { masc: "Silencioso", fem: "Silenciosa" },
  { masc: "Diligente", fem: "Diligente" },
  { masc: "Aventajado", fem: "Aventajada" },
  { masc: "Entusiasta", fem: "Entusiasta" },
  { masc: "Sabio", fem: "Sabia" },
  { masc: "Perspicaz", fem: "Perspicaz" },
  { masc: "Ordenado", fem: "Ordenada" },
  { masc: "Puntual", fem: "Puntual" },
  { masc: "Incansable", fem: "Incansable" },
  { masc: "Audaz", fem: "Audaz" },
  { masc: "Astuto", fem: "Astuta" },
  { masc: "Veloz", fem: "Veloz" },
  { masc: "Cordial", fem: "Cordial" },
  { masc: "Trabajador", fem: "Trabajadora" },
  { masc: "Despierto", fem: "Despierta" },
  { masc: "Atento", fem: "Atenta" },
  { masc: "Detallista", fem: "Detallista" },
  { masc: "Responsable", fem: "Responsable" },
  { masc: "Comprometido", fem: "Comprometida" },
  { masc: "Motivado", fem: "Motivada" },
  { masc: "Resuelto", fem: "Resuelta" },
  { masc: "Ágil", fem: "Ágil" },
  { masc: "Certero", fem: "Certera" },
  { masc: "Sereno", fem: "Serena" },
  { masc: "Risueño", fem: "Risueña" },
  { masc: "Ameno", fem: "Amena" },
  { masc: "Lúcido", fem: "Lúcida" },
  { masc: "Minucioso", fem: "Minuciosa" },
  { masc: "Vivaz", fem: "Vivaz" },
  { masc: "Sagaz", fem: "Sagaz" },
  { masc: "Firme", fem: "Firme" },
  { masc: "Sensato", fem: "Sensata" },
  { masc: "Atinado", fem: "Atinada" },
  { masc: "Cauteloso", fem: "Cautelosa" },
  { masc: "Espabilado", fem: "Espabilada" },
];

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)];
  if (!item) throw new Error("alias-generator: empty pool");
  return item;
}

/** Builds one "Animal Adjective" candidate, agreeing gender. Pass a seeded `rng` (0..1) in tests. */
export function randomAlias(rng: () => number = Math.random): string {
  const noun = pick(ANIMALS, rng);
  const adjective = pick(ADJECTIVES, rng);
  const adjectiveForm = noun.gender === "M" ? adjective.masc : adjective.fem;
  return `${noun.noun} ${adjectiveForm}`;
}
