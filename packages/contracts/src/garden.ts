import { z } from "zod";
import type { CollaborationProgressDto } from "./achievements";
import { EXTRA_NATIVE_SPECIES } from "./garden-native-species";

export const GARDEN_SIZE = 25;
export const GARDEN_MAX_SIZE = 50;
export const GARDEN_EXPANSION_SIZE = 5;
/** Progressive virtual-seed prices. Expanding never increases study-time credit. */
export function gardenExpansion(plotCount: number) {
  return plotCount >= GARDEN_MAX_SIZE ? null : {
    plots: GARDEN_EXPANSION_SIZE,
    cost: 75 + ((plotCount - GARDEN_SIZE) / GARDEN_EXPANSION_SIZE) * 25,
    requiredPlants: plotCount - GARDEN_EXPANSION_SIZE,
  };
}
export const gardenExpandSchema = z.object({ plotCount: z.number().int().min(GARDEN_SIZE).max(GARDEN_MAX_SIZE - GARDEN_EXPANSION_SIZE).refine(n => n % 5 === 0) }).strict();
export type GardenExpandRequest = z.infer<typeof gardenExpandSchema>;
export const GARDEN_STARTER_SEEDS = 30;
export const GARDEN_MINUTES_PER_SEED = 6;
export const GARDEN_SEED_PACK = { seeds: 100, priceArs: 5000 } as const;
export const gardenCheckoutSchema = z.object({}).strict();
export interface GardenCheckoutDto {
  initPoint: string;
}
export interface GardenShopDto {
  enabled: boolean;
  pack: { seeds: number; priceArs: number };
  orders: {
    id: string;
    createdAt: string;
    status: string;
    creditedSeeds: number;
  }[];
}

export interface GardenSpecies {
  id: string;
  name: string;
  scientificName: string;
  region: string;
  description: string;
  source: string;
  cost: number;
  growthMinutes: number;
  reward: number;
  crown: "round" | "umbrella" | "conifer" | "bottle" | "weeping";
  foliage: string;
  flower: string | null;
  bark: string;
  /** Older entries are trees. Used to browse the expanded native nursery. */
  kind?: "tree" | "palm" | "shrub" | "flower" | "grass" | "cactus" | "aquatic";
  /** Visual habitat; planting and growth rules stay the same in every numbered plot. */
  habitat?: "water" | "shore";
}

const TREES = "https://www.argentina.gob.ar/node/492317";
const TALARES = "https://www.ambiente.gba.gob.ar/node/3264";

/** Virtual growth times are game rules, not the biological growth rate of these species. */
export const GARDEN_SPECIES: readonly GardenSpecies[] = [
  {
    id: "espinillo",
    name: "Espinillo",
    scientificName: "Vachellia caven",
    region: "Espinal y región chaqueña",
    description: "Sus pequeñas flores amarillas forman pompones perfumados.",
    source: TALARES,
    cost: 12,
    growthMinutes: 120,
    reward: 18,
    crown: "round",
    foliage: "#76934e",
    flower: "#f5cb54",
    bark: "#8b6242",
  },
  {
    id: "tala",
    name: "Tala",
    scientificName: "Celtis tala",
    region: "Espinal y talares bonaerenses",
    description:
      "Sus frutos y su copa dan alimento y refugio a la fauna nativa.",
    source: TALARES,
    cost: 18,
    growthMinutes: 180,
    reward: 27,
    crown: "round",
    foliage: "#7b9c61",
    flower: null,
    bark: "#93816a",
  },
  {
    id: "ceibo",
    name: "Ceibo",
    scientificName: "Erythrina crista-galli",
    region: "Litoral y riberas del Río de la Plata",
    description:
      "La flor nacional argentina aporta un rojo inconfundible a las riberas.",
    source: "https://www.argentina.gob.ar/pais/ceibo",
    cost: 25,
    growthMinutes: 240,
    reward: 38,
    crown: "round",
    foliage: "#4e885e",
    flower: "#ed655b",
    bark: "#82634f",
  },
  {
    id: "chanar",
    name: "Chañar",
    scientificName: "Geoffroea decorticans",
    region: "Monte, Espinal y Chaco",
    description:
      "Su corteza se desprende y deja ver tonos verdes. Da frutos dulces.",
    source: TALARES,
    cost: 28,
    growthMinutes: 300,
    reward: 42,
    crown: "round",
    foliage: "#8aab75",
    flower: "#eab84e",
    bark: "#8d9c67",
  },
  {
    id: "algarrobo",
    name: "Algarrobo blanco",
    scientificName: "Neltuma alba",
    region: "Norte y centro de Argentina",
    description:
      "Una copa generosa y vainas usadas en harinas y alimentos tradicionales.",
    source:
      "https://www.argentina.gob.ar/inta/ciap/el-cultivo-del-algarrobo-en-argentina",
    cost: 35,
    growthMinutes: 360,
    reward: 53,
    crown: "umbrella",
    foliage: "#68916a",
    flower: null,
    bark: "#80634d",
  },
  {
    id: "jacaranda",
    name: "Jacarandá",
    scientificName: "Jacaranda mimosifolia",
    region: "Yungas del noroeste argentino",
    description: "Su floración violeta es una de las postales de la primavera.",
    source:
      "https://buenosaires.gob.ar/gcaba_historico/arboles-nativos/jacaranda",
    cost: 45,
    growthMinutes: 480,
    reward: 68,
    crown: "umbrella",
    foliage: "#6f9276",
    flower: "#a18ada",
    bark: "#7f6559",
  },
  {
    id: "aguaribay",
    name: "Aguaribay",
    scientificName: "Schinus areira",
    region: "Noroeste argentino",
    description:
      "Hojas persistentes, ramas colgantes y racimos de frutos rosados.",
    source: TREES,
    cost: 45,
    growthMinutes: 480,
    reward: 68,
    crown: "weeping",
    foliage: "#689d7a",
    flower: "#d99093",
    bark: "#917355",
  },
  {
    id: "palo-borracho",
    name: "Palo borracho rosado",
    scientificName: "Ceiba speciosa",
    region: "Nordeste argentino",
    description: "Su tronco ensanchado almacena agua y sus flores son rosadas.",
    source:
      "https://www.macnconicet.gob.ar/arboles-nativos-de-argentina-que-rodean-el-museo/",
    cost: 60,
    growthMinutes: 600,
    reward: 90,
    crown: "bottle",
    foliage: "#589775",
    flower: "#e6a2bd",
    bark: "#8b9c72",
  },
  {
    id: "calden",
    name: "Caldén",
    scientificName: "Neltuma caldenia",
    region: "Espinal, incluido el sudoeste bonaerense",
    description:
      "Forma los caldenales, bosques característicos del centro del país.",
    source: "https://www.ambiente.gba.gob.ar/bosquesnativos/caldenal",
    cost: 70,
    growthMinutes: 720,
    reward: 105,
    crown: "umbrella",
    foliage: "#909c65",
    flower: null,
    bark: "#7c6651",
  },
  {
    id: "lapacho",
    name: "Lapacho rosado",
    scientificName: "Handroanthus heptaphyllus",
    region: "Nordeste argentino",
    description:
      "Se destaca por sus flores rosadas antes del desarrollo del follaje.",
    source: "https://magyp.gob.ar/intranet/0030_arboles.php",
    cost: 80,
    growthMinutes: 900,
    reward: 120,
    crown: "round",
    foliage: "#799a70",
    flower: "#dc94be",
    bark: "#8a6c5c",
  },
  {
    id: "arrayan",
    name: "Arrayán",
    scientificName: "Luma apiculata",
    region: "Bosques andino patagónicos",
    description:
      "Su corteza color canela y sus pequeñas flores blancas lo distinguen.",
    source: "https://sib.gob.ar/especies/luma-apiculata",
    cost: 95,
    growthMinutes: 1200,
    reward: 143,
    crown: "round",
    foliage: "#3e7960",
    flower: "#f6f1da",
    bark: "#ce8656",
  },
  {
    id: "pehuen",
    name: "Pehuén",
    scientificName: "Araucaria araucana",
    region: "Cordillera de Neuquén y Río Negro",
    description:
      "Sus ramas forman pisos y sus semillas se conocen como piñones.",
    source: "https://sib.gob.ar/especies/araucaria-araucana",
    cost: 120,
    growthMinutes: 1800,
    reward: 180,
    crown: "conifer",
    foliage: "#3e796d",
    flower: null,
    bark: "#8c8071",
  },
  ...EXTRA_NATIVE_SPECIES,
];

export interface GardenPlant {
  id: string;
  plot: number;
  speciesId: string;
  plantedAt: string;
  studiedMinutes: number;
  progress: number;
  stage: "seed" | "sprout" | "young" | "mature";
}

export interface GardenDto {
  plotCount: number;
  landscapeSeed: number;
  collaboration?: CollaborationProgressDto;
  /** Legacy field: gardens are always visitable by authenticated, unblocked users. */
  shared: boolean;
  seeds: number;
  studyMinutes: number;
  nextSeedMinutes: number;
  plants: GardenPlant[];
  collection: Record<string, number>;
}

export interface SharedGardenDto {
  plotCount: number;
  landscapeSeed: number;
  plants: Pick<GardenPlant, "plot" | "speciesId" | "stage" | "progress">[];
  collection: Record<string, number>;
}
export const gardenVisibilitySchema = z.object({ shared: z.boolean() }).strict();

const plotSchema = z
  .number()
  .int()
  .min(0)
  .max(GARDEN_MAX_SIZE - 1);
export const gardenPlantSchema = z
  .object({
    plot: plotSchema,
    speciesId: z
      .string()
      .refine(
        (id) => GARDEN_SPECIES.some((s) => s.id === id),
        "Especie desconocida.",
      ),
  })
  .strict();
export const gardenRedeemSchema = z
  .object({ plot: plotSchema, plantId: z.uuid() })
  .strict();
export type GardenPlantRequest = z.infer<typeof gardenPlantSchema>;
export type GardenRedeemRequest = z.infer<typeof gardenRedeemSchema>;
