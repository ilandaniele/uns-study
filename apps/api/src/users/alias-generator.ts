/**
 * Generates fun, random, family-friendly Spanish aliases ("Carpincho Estudioso", "Mate Filosófico")
 * shown instead of "Usuario anónimo" for hidden users. Pairs an Argentine animal/object noun with a
 * study-themed adjective, agreeing gender (masculine/feminine) between the two.
 */

interface Noun {
  word: string;
  gender: "M" | "F";
}

interface Adjective {
  masc: string;
  fem: string;
}

/** >=40 Argentine animals/objects, each tagged with its grammatical gender. */
const NOUNS: Noun[] = [
  { word: "Carpincho", gender: "M" },
  { word: "Hornero", gender: "M" },
  { word: "Yaguareté", gender: "M" },
  { word: "Puma", gender: "M" },
  { word: "Zorro", gender: "M" },
  { word: "Chimango", gender: "M" },
  { word: "Benteveo", gender: "M" },
  { word: "Ñandú", gender: "M" },
  { word: "Cóndor", gender: "M" },
  { word: "Guanaco", gender: "M" },
  { word: "Tatú", gender: "M" },
  { word: "Pecarí", gender: "M" },
  { word: "Aguará", gender: "M" },
  { word: "Zorzal", gender: "M" },
  { word: "Jilguero", gender: "M" },
  { word: "Coipo", gender: "M" },
  { word: "Cardenal", gender: "M" },
  { word: "Chingolo", gender: "M" },
  { word: "Vizcacha", gender: "F" },
  { word: "Mulita", gender: "F" },
  { word: "Vicuña", gender: "F" },
  { word: "Llama", gender: "F" },
  { word: "Iguana", gender: "F" },
  { word: "Lechuza", gender: "F" },
  { word: "Tortuga", gender: "F" },
  { word: "Rana", gender: "F" },
  { word: "Nutria", gender: "F" },
  { word: "Chinchilla", gender: "F" },
  { word: "Corzuela", gender: "F" },
  { word: "Mara", gender: "F" },
  { word: "Calandria", gender: "F" },
  { word: "Cotorra", gender: "F" },
  { word: "Mate", gender: "M" },
  { word: "Termo", gender: "M" },
  { word: "Cuaderno", gender: "M" },
  { word: "Lápiz", gender: "M" },
  { word: "Pizarrón", gender: "M" },
  { word: "Escritorio", gender: "M" },
  { word: "Apunte", gender: "M" },
  { word: "Resaltador", gender: "M" },
  { word: "Diccionario", gender: "M" },
  { word: "Manual", gender: "M" },
  { word: "Borrador", gender: "M" },
  { word: "Anotador", gender: "M" },
  { word: "Bombilla", gender: "F" },
  { word: "Mochila", gender: "F" },
  { word: "Birome", gender: "F" },
  { word: "Carpeta", gender: "F" },
  { word: "Biblioteca", gender: "F" },
  { word: "Cartuchera", gender: "F" },
  { word: "Regla", gender: "F" },
  { word: "Calculadora", gender: "F" },
];

/** >=40 study-themed adjectives, masculine/feminine forms (invariable adjectives repeat the same form). */
const ADJECTIVES: Adjective[] = [
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
];

function pick<T>(items: T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)];
  if (!item) throw new Error("alias-generator: empty pool");
  return item;
}

/** Builds one "Noun Adjective" candidate, agreeing gender. Pass a seeded `rng` (0..1) in tests. */
export function randomAlias(rng: () => number = Math.random): string {
  const noun = pick(NOUNS, rng);
  const adjective = pick(ADJECTIVES, rng);
  const adjectiveForm = noun.gender === "M" ? adjective.masc : adjective.fem;
  return `${noun.word} ${adjectiveForm}`;
}
