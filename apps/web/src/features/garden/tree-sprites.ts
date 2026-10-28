import type { GardenPlant, GardenSpecies } from "@sala/contracts";

// Exact row-major order of the GPT atlases; prompts and provenance: docs/garden-tree-art.md.
const GROUPS = {
  "ribera-nativa": ["coronillo", "anacahuita", "caraguata", "flechilla", "pasto-plateado", "chilca", "plumerillo-rosado", "santa-lucia", "petunia-blanca", "saeta", "duraznillo-de-agua", "helechito-de-agua"],
  arboles: ["espinillo", "tala", "ceibo", "chanar", "algarrobo", "jacaranda", "aguaribay", "palo-borracho", "calden", "lapacho", "arrayan", "pehuen"],
  "arboles-extra": ["ombu", "sauce-criollo", "timbo", "tipa", "ibirapita", "peteribi", "guayacan", "quebracho-colorado", "quebracho-blanco", "yerba-mate", "lenga", "notro"],
  "plantas-nativas": ["yatay", "pindo", "caranday", "guaran", "sen-del-campo", "plumerillo-rojo", "margarita-punzo", "salvia-azul", "cortadera", "cardon", "quimil", "cactus-bola"],
  "pastizal-humedal": ["paja-vizcachera", "paja-colorada", "pasto-bahia", "vinagrillo", "carquejilla", "marcela", "verbena-bonaerense", "totora", "junco", "camalote", "repollito-de-agua", "estrella-de-agua"],
};
const FRAMES = new Map(Object.entries(GROUPS).flatMap(([group, ids]) => ids.map((id, frame) => [id, { group, frame }] as const)));

export function treeSprite(species: GardenSpecies, stage: GardenPlant["stage"]) {
  if (stage === "seed" || stage === "sprout") {
    const kind = species.kind;
    if (species.habitat === "water") return { file: "brotes-acuaticos-gpt-v1.webp", columns: 2, rows: 1, frame: stage === "sprout" ? 1 : 0 };
    const earlyFrame = kind === "palm" ? 0 : kind === "cactus" ? 2 : kind === "grass" || species.habitat === "shore" ? 4 : kind === "flower" ? 6 : null;
    return earlyFrame === null
      ? { file: "brotes-gpt-v1.webp", columns: 2, rows: 2, frame: (species.id === "pehuen" ? 2 : 0) + (stage === "sprout" ? 1 : 0) }
      : { file: "brotes-nativos-gpt-v1.webp", columns: 4, rows: 2, frame: earlyFrame + (stage === "sprout" ? 1 : 0) };
  }
  const { group, frame } = FRAMES.get(species.id) ?? { group: "arboles", frame: 0 };
  const suffix = stage === "young" ? "jovenes" : "adultos";
  return { file: `${group}-${suffix}-gpt-v1.webp`, columns: 4, rows: 3, frame };
}
