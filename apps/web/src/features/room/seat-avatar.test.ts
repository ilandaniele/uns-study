import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANIMALS } from "@sala/contracts";
import { AVATAR_BACKDROP, markedByLabel, occupantAvatarProps, seatAvatarRender } from "./seat-avatar";

describe("seatAvatarRender", () => {
  it("draws nothing for seats that aren't occupied or have no avatar info", () => {
    expect(seatAvatarRender({ kind: "photo", url: "https://x/a.jpg" }, false)).toBeNull();
    expect(seatAvatarRender(null, true)).toBeNull();
    expect(seatAvatarRender(undefined, true)).toBeNull();
  });

  it("maps each descriptor kind to its render choice", () => {
    expect(seatAvatarRender({ kind: "photo", url: "https://x/a.jpg" }, true)).toEqual({ type: "photo", url: "https://x/a.jpg" });
    expect(seatAvatarRender({ kind: "animal", animalId: "carpincho" }, true)).toEqual({ type: "animal", src: "/avatars/animals/carpincho.svg" });
    expect(seatAvatarRender({ kind: "silhouette" }, true)).toEqual({ type: "silhouette" });
  });

  it("degrades an unknown animal or empty photo url to the silhouette", () => {
    expect(seatAvatarRender({ kind: "animal", animalId: "dragon" }, true)).toEqual({ type: "silhouette" });
    expect(seatAvatarRender({ kind: "photo", url: "" }, true)).toEqual({ type: "silhouette" });
  });

  it("formats the 'Marcado por' line with minutes since the observation", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(markedByLabel("Ana", "2026-01-01T11:55:00Z", now)).toBe("Marcado por: Ana · hace 5 min");
    expect(markedByLabel("Zorro Astuto", "2026-01-01T11:59:50Z", now)).toBe("Marcado por: Zorro Astuto · hace instantes");
    expect(markedByLabel("Ana", "2026-01-01T09:00:00Z", now)).toBe("Marcado por: Ana · hace 3 h");
    expect(markedByLabel("Ana", "2026-01-01T11:55:00Z", now, "SAVED")).toBe("Ana avisó que este lugar lo guardaron · hace 5 min");
  });

  it("has a copied illustration file for every catalog animal", () => {
    for (const animal of ANIMALS) {
      expect(existsSync(path.join(process.cwd(), "public", "avatars", "animals", `${animal.id}.svg`))).toBe(true);
    }
  });
});

describe("occupantAvatarProps", () => {
  it("renders an animal as an image with px padding, never a percentage", () => {
    const props = occupantAvatarProps({ kind: "animal", animalId: "delfin" }, 40);
    expect(props).toEqual({
      type: "animal",
      src: "/avatars/animals/delfin.svg",
      style: { width: 40, height: 40, padding: 5, backgroundColor: AVATAR_BACKDROP },
    });
  });

  it("maps photos and falls back to a sized silhouette", () => {
    expect(occupantAvatarProps({ kind: "photo", url: "https://x/a.jpg" }, 24)).toEqual({ type: "photo", src: "https://x/a.jpg", style: { width: 24, height: 24 } });
    expect(occupantAvatarProps({ kind: "animal", animalId: "nope" }, 32)).toEqual({ type: "silhouette", style: { width: 32, height: 32 } });
    expect(occupantAvatarProps({ kind: "silhouette" }, 32).type).toBe("silhouette");
  });
});
