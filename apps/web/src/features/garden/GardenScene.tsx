"use client";

import { GARDEN_SPECIES, type SharedGardenDto } from "@sala/contracts";
import { TreeArt } from "./TreeArt";
import { PlotPicker } from "./PlotPicker";
import { GARDEN_PLOT_ORDER } from "./garden-layout";
import { GardenBridge, GardenLandscape } from "./GardenLandscape";
import { usePlantVisibility } from "./plant-motion";

const stages = { seed: "semilla", sprout: "brote", young: "joven", mature: "adulto" };

/** Upright GPT-painted tree cutouts on a depth-sorted isometric island. */
export function GardenScene({ plants, selected, onSelect }: {
  plants: SharedGardenDto["plants"];
  selected?: number | null;
  onSelect?: (plot: number) => void;
}) {
  const sceneRef = usePlantVisibility();
  return <div className="forest-diorama relative isolate overflow-hidden rounded-3xl">
    <svg ref={sceneRef} viewBox="0 0 600 430" width="600" height="430" className="block h-auto w-full" role="group" aria-label="Bosque nativo: 25 parcelas">
      <GardenLandscape />
      {GARDEN_PLOT_ORDER.map(({ plot, row, col, x, y }) => {
        const plant = plants.find(p => p.plot === plot);
        const species = plant && GARDEN_SPECIES.find(s => s.id === plant.speciesId);
        const label = `Parcela ${plot + 1}: ${plant && species ? `${species.name}, ${stages[plant.stage]}` : "vacía, plantar"}`;
        return <g key={plot} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
          aria-label={label} aria-pressed={onSelect ? selected === plot : undefined} data-garden-plot={plot} data-plot-x={x} data-plot-y={y}
          onClick={onSelect ? () => onSelect(plot) : undefined}
          onKeyDown={onSelect ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(plot); } } : undefined}
          className={onSelect ? "forest-parcel cursor-pointer outline-none" : ""}>
          <title>{label}</title>
          <path d={`M${x} ${y - 25}l48 25-48 25-48-25Z`} fill={species?.habitat === "water" ? "var(--garden-water)" : selected === plot ? "var(--garden-accent)" : (row + col) % 2 ? "var(--garden-tile)" : "var(--garden-soil)"}
            stroke={selected === plot ? "var(--garden-accent)" : "var(--garden-tile-border)"} strokeWidth={selected === plot ? 3 : 1} />
          {species?.habitat ? <g pointerEvents="none" aria-hidden="true">
            <ellipse cx={x} cy={y + 3} rx={species.habitat === "water" ? 23 : 18} ry={6} fill="var(--garden-water-deep)" opacity=".35" />
            <path d={`M${x - 27} ${y + 4}q10 4 18 0m15 4q9 2 15-2`} fill="none" stroke="var(--garden-water-light)" strokeWidth="1.5" opacity=".8" />
          </g> : null}
          {plant && species ? <TreeArt species={species} stage={plant.stage} variant={plot} viewport={{ x: x - 40, y: y - 85, width: 80, height: 90 }} /> :
            <g pointerEvents="none" opacity=".45" stroke="var(--garden-empty)" strokeWidth="2"><path d={`M${x - 5} ${y}h10m-5-5v10`} /></g>}
        </g>;
      })}
      <GardenBridge />
    </svg>
    {!plants.length ? <p className="px-4 pb-4 text-center text-sm text-muted">Tu bosque empieza con una semilla.</p> : null}
    {onSelect ? <div className="px-2 pb-4 sm:px-5"><PlotPicker plants={plants} selected={selected} onSelect={onSelect} /></div> : null}
  </div>;
}
