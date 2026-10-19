/**
 * Catalog of Argentine animals used for aliases ("Carpincho Estudioso") and for the map avatar of
 * hidden users. Single source of truth: the API alias generator picks nouns from here and the web
 * renders `/avatars/animals/<id>.svg` (copied from Twemoji by `apps/web/scripts/copy-animal-avatars.mjs`).
 *
 * `noun` is always a single capitalised word so an alias is exactly "Noun Adjective" and the animal
 * can be recovered from an alias's first word (see `animalIdFromAlias`).
 * `twemoji` is the Twemoji codepoint file name. Some animals have no emoji of their own and use the
 * closest look-alike: carpincho -> hamster, quirquincho -> hedgehog, ñandú -> turkey,
 * torcaza -> dove, otaria -> seal, dorado -> fish, guanaco -> camel, puma -> lion,
 * chinchilla -> mouse, benteveo -> baby chick. Look-alikes are picked so no two animals share a
 * near-identical drawing; each animal also gets its own backdrop colour (`animalBackdrop`).
 */
export interface AnimalDef {
  id: string;
  noun: string;
  gender: "M" | "F";
  twemoji: string;
}

export const ANIMALS: readonly AnimalDef[] = [
  { id: "yaguarete", noun: "Yaguareté", gender: "M", twemoji: "1f406" },
  { id: "puma", noun: "Puma", gender: "M", twemoji: "1f981" },
  { id: "condor", noun: "Cóndor", gender: "M", twemoji: "1f985" },
  { id: "pinguino", noun: "Pingüino", gender: "M", twemoji: "1f427" },
  { id: "zorrino", noun: "Zorrino", gender: "M", twemoji: "1f9a8" },
  { id: "zorro", noun: "Zorro", gender: "M", twemoji: "1f98a" },
  { id: "flamenco", noun: "Flamenco", gender: "M", twemoji: "1f9a9" },
  { id: "guanaco", noun: "Guanaco", gender: "M", twemoji: "1f42a" },
  { id: "llama", noun: "Llama", gender: "F", twemoji: "1f999" },
  { id: "yacare", noun: "Yacaré", gender: "M", twemoji: "1f40a" },
  { id: "lechuza", noun: "Lechuza", gender: "F", twemoji: "1f989" },
  { id: "loro", noun: "Loro", gender: "M", twemoji: "1f99c" },
  { id: "otaria", noun: "Otaria", gender: "F", twemoji: "1f9ad" },
  { id: "ballena", noun: "Ballena", gender: "F", twemoji: "1f433" },
  { id: "tortuga", noun: "Tortuga", gender: "F", twemoji: "1f422" },
  { id: "rana", noun: "Rana", gender: "F", twemoji: "1f438" },
  { id: "murcielago", noun: "Murciélago", gender: "M", twemoji: "1f987" },
  { id: "mariposa", noun: "Mariposa", gender: "F", twemoji: "1f98b" },
  { id: "coipo", noun: "Coipo", gender: "M", twemoji: "1f9ab" },
  { id: "carpincho", noun: "Carpincho", gender: "M", twemoji: "1f439" },
  { id: "hornero", noun: "Hornero", gender: "M", twemoji: "1f426" },
  { id: "benteveo", noun: "Benteveo", gender: "M", twemoji: "1f424" },
  { id: "torcaza", noun: "Torcaza", gender: "F", twemoji: "1f54a" },
  { id: "vizcacha", noun: "Vizcacha", gender: "F", twemoji: "1f430" },
  { id: "huemul", noun: "Huemul", gender: "M", twemoji: "1f98c" },
  { id: "caballo", noun: "Caballo", gender: "M", twemoji: "1f40e" },
  { id: "vaca", noun: "Vaca", gender: "F", twemoji: "1f404" },
  { id: "nandu", noun: "Ñandú", gender: "M", twemoji: "1f983" },
  { id: "quirquincho", noun: "Quirquincho", gender: "M", twemoji: "1f994" },
  { id: "pecari", noun: "Pecarí", gender: "M", twemoji: "1f417" },
  { id: "caraya", noun: "Carayá", gender: "M", twemoji: "1f412" },
  { id: "delfin", noun: "Delfín", gender: "M", twemoji: "1f42c" },
  { id: "yarara", noun: "Yarará", gender: "F", twemoji: "1f40d" },
  { id: "chinchilla", noun: "Chinchilla", gender: "F", twemoji: "1f401" },
  { id: "dorado", noun: "Dorado", gender: "M", twemoji: "1f41f" },
];

const BY_ID = new Map(ANIMALS.map((a) => [a.id, a]));
const BY_NOUN = new Map(ANIMALS.map((a) => [a.noun.toLowerCase(), a]));

export function isAnimalId(id: string | null | undefined): id is string {
  return id != null && BY_ID.has(id);
}

/** Recovers the catalog animal from an alias ("Carpincho Estudioso", "Zorro Astuto 42"); `null` for legacy nouns. */
export function animalIdFromAlias(alias: string | null | undefined): string | null {
  const noun = alias?.trim().split(/\s+/)[0]?.toLowerCase();
  return noun ? (BY_NOUN.get(noun)?.id ?? null) : null;
}

/**
 * Pastel backdrop behind an animal's illustration. Hues step by the golden angle through the catalog
 * order, so neighbouring animals never get similar colours. Unknown ids get the neutral grey-blue.
 */
export function animalBackdrop(animalId: string): string {
  const index = ANIMALS.findIndex((a) => a.id === animalId);
  if (index < 0) return "#c5d0e6";
  return `hsl(${Math.round((index * 137.508) % 360)} 70% 84%)`;
}

/** Public path of an animal's illustration (served from `apps/web/public`). */
export function animalAvatarPath(animalId: string): string {
  return `/avatars/animals/${animalId}.svg`;
}
