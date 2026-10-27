import { z } from "zod";

export const APP_SECTIONS = ["sala", "foco", "jardin", "ranking", "guias", "personas", "perfil", "mas", "chat"] as const;
export type AppSection = (typeof APP_SECTIONS)[number];
export const APP_SECTION_LABELS: Record<AppSection, string> = {
  sala: "Sala", foco: "Foco", jardin: "Jardín", ranking: "Ranking", guias: "Guías",
  personas: "Personas", perfil: "Perfil", mas: "Más", chat: "Chat",
};
export const sectionVisitSchema = z.object({ section: z.enum(APP_SECTIONS) }).strict();
export interface SectionUsageDto {
  days: 7 | 30;
  fromDate: string;
  toDate: string;
  total: number;
  sections: { section: AppSection; views: number }[];
}
