import { z } from "zod";

export const GARDEN_BIOME_IDS = ["pampa", "ribera", "espinal", "andino"] as const;
export type GardenBiomeId = typeof GARDEN_BIOME_IDS[number];
/** Permanent cosmetic unlocks use accepted distinct-seat/day collaboration credits. */
export const GARDEN_BIOMES = [
  { id: "pampa", name: "Pastizal pampeano", description: "Luz cálida, pastos suaves y un arroyo entre las parcelas.", requiredPlaces: 0 },
  { id: "ribera", name: "Ribera del litoral", description: "Orillas húmedas, verdes intensos y agua color jade.", requiredPlaces: 5 },
  { id: "espinal", name: "Espinal", description: "Tierra ocre, piedras claras y vegetación de tonos secos.", requiredPlaces: 15 },
  { id: "andino", name: "Bosque andino", description: "Verdes profundos, rocas frías y agua de montaña.", requiredPlaces: 30 },
] as const satisfies readonly { id: GardenBiomeId; name: string; description: string; requiredPlaces: number }[];
export const gardenBiomeSchema = z.object({ biome: z.enum(GARDEN_BIOME_IDS) }).strict();
export type GardenBiomeRequest = z.infer<typeof gardenBiomeSchema>;
