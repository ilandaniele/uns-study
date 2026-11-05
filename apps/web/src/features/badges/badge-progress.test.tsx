import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BADGE_IDS, type AchievementDto } from "@sala/contracts";
import { badgeProgressText } from "./badge-progress";
import { AchievementGrid } from "./AchievementCollection";
import { BadgeMedal } from "./BadgeMedal";

const badge: AchievementDto = { id: "free_5", title: "Mate disponible", description: "Cinco lugares libres", tier: "bronze", category: "free", earned: false, earnedAt: null, progress: 0.8, goal: { current: 4, target: 5, unit: "lugares" } };

describe("badge goals and Argentine medallions", () => {
  it("shows the exact count, remaining unit and an accessible progress bar", () => {
    expect(badgeProgressText(badge)).toEqual({ count: "4 / 5 lugares", remaining: "Te falta 1 lugar" });
    const html = renderToStaticMarkup(<AchievementGrid badges={[badge]}/>);
    expect(html).toContain('aria-label="Avance de Mate disponible"');
    expect(html).toContain('value="0.8"');
    expect(html).toContain("4 / 5 lugares");
    expect(html).toContain("Te falta 1 lugar");
    expect(html).toContain('data-badge-motif="mate"');
  });
  it("formats hours without hiding the remaining minutes and preserves earned states", () => {
    expect(badgeProgressText({ ...badge, goal: { current: 395, target: 600, unit: "minutos" } })).toEqual({ count: "6 h 35 min / 10 h", remaining: "Te faltan 3 h 25 min" });
    expect(badgeProgressText({ ...badge, earned: true, progress: 1, goal: { current: 20, target: 5, unit: "lugares" } })).toEqual({ count: "5 / 5 lugares", remaining: "En tu colección" });
  });
  it("renders every supported badge with a motif, keeping unique SVG definitions", () => {
    const html = renderToStaticMarkup(<div>{BADGE_IDS.map(id => <BadgeMedal key={id} badgeId={id} tier="gold" label={id}/>)}</div>);
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toHaveLength(20); expect(new Set(ids).size).toBe(20);
    for (const motif of ["mate", "termo", "bombilla", "sol", "ceibo", "hornero", "bandera"]) expect(html).toContain(`data-badge-motif="${motif}"`);
  });
});
