import { describe, expect, it } from "vitest";
import { GUIDES } from "@/features/guides/guides";
import { PUBLISHED_GUIDE_PATHS } from "@/features/guides/published-guide-paths";
import { isAdSenseAllowed, isAdSenseContentPath, isExcludedPath, type AdPlacement } from "./ad-config";

const placements: AdPlacement[] = ["article", "rail", "room-bottom", "community-feed"];

describe("AdSense publisher-content policy", () => {
  it("keeps the small client registry in sync with real published articles", () => {
    expect([...PUBLISHED_GUIDE_PATHS].sort()).toEqual(GUIDES.map(g => `/guias/${g.slug}`).sort());
    expect(new Set(PUBLISHED_GUIDE_PATHS).size).toBe(PUBLISHED_GUIDE_PATHS.length);
  });

  it("allows one inline article placement on every published guide", () => {
    for (const path of PUBLISHED_GUIDE_PATHS) {
      expect(isAdSenseContentPath(path)).toBe(true);
      expect(isAdSenseAllowed("article", path)).toBe(true);
      for (const placement of placements.filter(p => p !== "article")) expect(isAdSenseAllowed(placement, path)).toBe(false);
    }
  });

  it("rejects empty search/library pages, unpublished articles, nested paths and redirects", () => {
    for (const path of ["/guias", "/guias/no-existe", "/guias/tecnica-pomodoro/otra", "/guias/tecnica-pomodoro-falso", "/guias/tecnica-pomodoro/", "/comunidad", "/comunidades"]) {
      expect(isAdSenseContentPath(path), path).toBe(false);
      for (const placement of placements) expect(isAdSenseAllowed(placement, path), `${placement} ${path}`).toBe(false);
    }
  });

  it("rejects every Google display placement on utility, account, contact and error screens", () => {
    for (const path of ["/", "/sala/principal", "/login", "/perfil", "/chat", "/ranking", "/jardin", "/mas", "/admin", "/q/abc", "/foco", "/proyecto", "/como-usar", "/sugerencias", "/privacidad", "/terminos", "/404", "/no-existe", "", null, undefined]) {
      for (const placement of placements) expect(isAdSenseAllowed(placement, path), `${placement} ${path}`).toBe(false);
    }
  });

  it("keeps reading and informational pages free of interruption/side-rail promos", () => {
    for (const path of ["/guias", ...PUBLISHED_GUIDE_PATHS, "/proyecto", "/como-usar", "/sugerencias", "/propiedad-intelectual"]) expect(isExcludedPath(path)).toBe(true);
  });
});
