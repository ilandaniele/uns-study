import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";

describe("room closure message", () => {
  it("shows closed rather than availability claims even with stale occupied counts", () => {
    const html = renderToStaticMarkup(<Hero
      summary={{ roomId: "room", total: 108, occupied: 7, free: 0, unknown: 101, saved: 0, uncertain: 0 }}
      seats={[]}
      operatingHours={{ open: false, opensAt: "2026-10-23T11:00:00Z", closesAt: "2026-10-24T03:00:00Z" }}
    />);
    expect(html).toContain("La sala está cerrada");
    expect(html).toContain("08:00");
    expect(html).toContain("22:00");
    expect(html).not.toContain("No hay lugares libres confirmados");
  });
});
