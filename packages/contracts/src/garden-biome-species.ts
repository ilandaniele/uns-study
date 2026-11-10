import type { GardenSpecies } from "./garden";

// SIB/APN sources checked 2026-11-10. Images are game illustrations, not identification plates.
function plant(id: string, name: string, scientificName: string, kind: GardenSpecies["kind"], description: string, cost: number, requiredPlaces = 0, habitat?: GardenSpecies["habitat"]): GardenSpecies {
  return { id, name, scientificName, kind, description, cost, requiredPlaces, habitat,
    region: habitat ? "Humedales de Argentina" : kind === "cactus" ? "Ambientes abiertos de Argentina" : "Flora nativa argentina",
    source: `https://sib.gob.ar/especies/${scientificName.toLowerCase().replaceAll(" ", "-")}`,
    growthMinutes: cost * 10, reward: Math.ceil(cost * 1.5), crown: "round", foliage: "#50815e", bark: "#88674d", flower: null };
}
export const BIOME_NATIVE_SPECIES: readonly GardenSpecies[] = [
  plant("lirio-azul", "Lirio azul", "Sisyrinchium chilense", "flower", "Hojas finas y pequeñas flores de tonos azulados o violetas.", 14),
  plant("lirio-del-pastizal", "Lirio del pastizal", "Herbertia lahue", "flower", "Flores violetas de tres pétalos exteriores anchos entre hojas angostas.", 18),
  plant("salvia-colorada", "Salvia colorada", "Salvia coccinea", "flower", "Flores tubulares rojas dispuestas a lo largo de tallos delgados.", 22, 5),
  plant("panil", "Pañil", "Buddleja globosa", "shrub", "Un arbusto de hojas alargadas y cabezuelas florales amarillo-anaranjadas.", 36, 15),
  plant("chaguar", "Chaguar", "Bromelia serra", "shrub", "Forma una roseta baja de hojas largas con bordes espinosos.", 24),
  plant("pasto-miel", "Pasto miel", "Paspalum dilatatum", "grass", "Una gramínea de hojas verdes con varias espigas sobre tallos finos.", 12),
  plant("cactus-flor-larga", "Cactus de flor larga", "Echinopsis eyriesii", "cactus", "Tallos verdes con costillas y flores grandes de tubo alargado. SIB incluye Echinopsis oxygona entre sus sinónimos.", 32, 10),
  plant("tunilla", "Tunilla", "Opuntia sulphurea", "cactus", "Un cactus bajo de artículos aplanados y flores generalmente amarillas.", 26),
  plant("azolla", "Azolla", "Azolla filiculoides", "aquatic", "Un helecho flotante de pequeñas frondas que pueden adquirir tonos rojizos.", 18, 0, "water"),
  plant("elodea", "Elodea", "Egeria densa", "aquatic", "Crece sumergida, con hojas estrechas alrededor de sus tallos y pequeñas flores blancas emergentes.", 22, 0, "water"),
  plant("amapola-de-agua", "Amapola de agua", "Hydrocleys nymphoides", "aquatic", "Hojas flotantes redondeadas y flores amarillas que se abren sobre el agua.", 30, 15, "water"),
  plant("espiga-de-agua", "Espiga de agua", "Pontederia cordata", "aquatic", "Hojas anchas y espigas de flores azuladas o violetas en los bordes del agua.", 28, 5, "shore"),
];
