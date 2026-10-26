import { useId } from "react";
import type { GardenPlant, GardenSpecies } from "@sala/contracts";

// Frame order is shared with the generation prompts in docs/garden-tree-art.md.
const SPECIES_FRAMES: Record<string, number> = {
  espinillo: 0, tala: 1, ceibo: 2, chanar: 3,
  algarrobo: 4, jacaranda: 5, aguaribay: 6, "palo-borracho": 7,
  calden: 8, lapacho: 9, arrayan: 10, pehuen: 11,
};
const WIDTH = 256;
const HEIGHT = 288;

/** GPT-painted cutouts; every growth stage shares the same ground anchor. */
export function TreeArt({ species, stage = "mature", decorative = true, variant = 0, viewport }: {
  species: GardenSpecies;
  stage?: GardenPlant["stage"];
  decorative?: boolean;
  variant?: number;
  /** Explicit SVG viewport when placed inside the isometric scene. */
  viewport?: { x: number; y: number; width: number; height: number };
}) {
  const clipId = `tree-sprite-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const early = stage === "seed" || stage === "sprout";
  const columns = early ? 2 : 4;
  const rows = early ? 2 : 3;
  const frame = early
    ? (species.id === "pehuen" ? 2 : 0) + (stage === "sprout" ? 1 : 0)
    : SPECIES_FRAMES[species.id] ?? 0;
  const atlas = early ? "brotes" : stage === "young" ? "arboles-jovenes" : "arboles-adultos";

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={viewport?.width ?? WIDTH} height={viewport?.height ?? HEIGHT}
      x={viewport?.x} y={viewport?.y}
      aria-hidden={decorative || undefined} role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : species.name}
      data-tree-species={species.id} data-tree-stage={stage}
      className={viewport ? "pointer-events-none overflow-hidden" : "h-full w-full overflow-hidden"}>
      <defs><clipPath id={clipId}><rect width={WIDTH} height={HEIGHT} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={variant % 2 ? `translate(${WIDTH} 0) scale(-1 1)` : undefined}>
          <image href={`/garden/${atlas}-gpt-v1.webp`}
            x={-(frame % columns) * WIDTH} y={-Math.floor(frame / columns) * HEIGHT}
            width={columns * WIDTH} height={rows * HEIGHT} />
        </g>
      </g>
    </svg>
  );
}
