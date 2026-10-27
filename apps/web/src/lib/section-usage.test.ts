import { afterEach, describe, expect, it, vi } from "vitest";
import { sectionOfPath } from "./section-usage";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });

describe("section usage without private URLs", () => {
  it("classifies sections without transmitting profile or conversation ids, and ignores tokens and administration", () => {
    for (const [path, section] of [["/", "sala"], ["/sala/principal", "sala"], ["/jardin", "jardin"], ["/foco", "foco"], ["/ranking", "ranking"], ["/guias/pomodoro", "guias"], ["/chat/dm/private-id", "chat"], ["/perfil/historial", "perfil"], ["/mas", "mas"]]) expect(sectionOfPath(path)).toBe(section);
    expect(sectionOfPath("/u/private-id/jardin")).toBe("jardin");
    expect(sectionOfPath("/u/private-id")).toBe("perfil");
    for (const path of ["/admin/users/private-id", "/restablecer", "/baja", "/q/signed-token", "/login", "/api/v1/me", "/constructor", "/__proto__"]) expect(sectionOfPath(path)).toBeNull();
  });
  it("sends only the section enum without credentials, deduplicates Strict Mode and quick revisits", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {}); vi.stubGlobal("document", {}); vi.stubGlobal("navigator", {});
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) });
    const fetch = vi.fn().mockResolvedValue({ status: 204 }); vi.stubGlobal("fetch", fetch);
    const { recordSectionVisit } = await import("./section-usage");
    recordSectionVisit("jardin"); recordSectionVisit("jardin"); recordSectionVisit(null);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/v1/usage/section", expect.objectContaining({ credentials: "omit", body: '{"section":"jardin"}', keepalive: true }));
    recordSectionVisit("foco"); expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000); recordSectionVisit("jardin"); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("honors Do Not Track and Global Privacy Control", async () => {
    vi.stubGlobal("window", {}); vi.stubGlobal("document", {});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { recordSectionVisit } = await import("./section-usage");
    vi.stubGlobal("navigator", { doNotTrack: "1" }); recordSectionVisit("jardin");
    vi.stubGlobal("navigator", { globalPrivacyControl: true }); recordSectionVisit("foco");
    expect(fetch).not.toHaveBeenCalled();
  });
});
