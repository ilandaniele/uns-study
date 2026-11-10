import { z } from "zod";

export const GARDEN_BIOME_IDS = ["pampa", "ribera", "espinal", "andino", "paranaense", "yungas", "monte", "estepa", "puna", "ibera"] as const;
export type GardenBiomeId = typeof GARDEN_BIOME_IDS[number];
/** Permanent cosmetic unlocks use accepted distinct-seat/day collaboration credits. */
export const GARDEN_BIOMES = [
  { id: "pampa", name: "Pastizal pampeano", description: "Luz cálida, pastos suaves y un arroyo entre las parcelas.", requiredPlaces: 0 },
  { id: "ribera", name: "Ribera del litoral", description: "Orillas húmedas, verdes intensos y agua color jade.", requiredPlaces: 5 },
  { id: "espinal", name: "Espinal", description: "Tierra ocre, piedras claras y vegetación de tonos secos.", requiredPlaces: 15 },
  { id: "andino", name: "Bosque andino", description: "Verdes profundos, rocas frías y agua de montaña.", requiredPlaces: 30 },
  { id: "paranaense", name: "Selva Paranaense", description: "Suelo rojizo, hojarasca húmeda y verdes de Misiones.", requiredPlaces: 40 },
  { id: "yungas", name: "Yungas", description: "Musgos y suelo húmedo inspirados en las selvas de montaña del noroeste.", requiredPlaces: 50 },
  { id: "monte", name: "Monte de Sierras y Bolsones", description: "Gravas cálidas y vegetación rala de los valles áridos del oeste.", requiredPlaces: 60 },
  { id: "estepa", name: "Estepa Patagónica", description: "Tierra pedregosa, coirones bajos y colores del sur ventoso.", requiredPlaces: 70 },
  { id: "puna", name: "Puna", description: "Gravas claras, pastos dispersos y tonos minerales de altura.", requiredPlaces: 80 },
  { id: "ibera", name: "Esteros del Iberá", description: "Pastizales húmedos y aguas tranquilas inspirados en Corrientes.", requiredPlaces: 100 },
] as const satisfies readonly { id: GardenBiomeId; name: string; description: string; requiredPlaces: number }[];
export const gardenBiomeSchema = z.object({ biome: z.enum(GARDEN_BIOME_IDS) }).strict();
export type GardenBiomeRequest = z.infer<typeof gardenBiomeSchema>;
