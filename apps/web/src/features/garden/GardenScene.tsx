"use client";

import { useMemo } from "react";
import { GARDEN_SIZE, GARDEN_SPECIES, type SharedGardenDto } from "@sala/contracts";
import { TreeArt } from "./TreeArt";
import { PlotPicker } from "./PlotPicker";
import { createGardenLayout } from "./garden-layout";
import { GardenBridge, GardenLandscape } from "./GardenLandscape";
import { usePlantVisibility } from "./plant-motion";

const stages = { seed: "semilla", sprout: "brote", young: "joven", mature: "adulto" };

/** Upright GPT-painted tree cutouts on a depth-sorted isometric island. */
export function GardenScene({ plants, selected, onSelect, plotCount = GARDEN_SIZE, landscapeSeed = 1 }: {
  plants: SharedGardenDto["plants"];
  selected?: number | null;
  onSelect?: (plot: number) => void;
  plotCount?: number;
  landscapeSeed?: number;
}) {
  const sceneRef = usePlantVisibility();
  const layout = useMemo(() => createGardenLayout(plotCount, landscapeSeed), [plotCount, landscapeSeed]);
  return <div className="forest-diorama relative isolate overflow-hidden rounded-3xl">
    <svg ref={sceneRef} viewBox="0 0 600 430" width="600" height="430" className="block h-auto w-full" role="group" aria-label={`Bosque nativo: ${layout.count} parcelas`} data-landscape-variant={layout.variant}>
      <GardenLandscape layout={layout} />
      {layout.plots.map(({ plot, x, y, halfWidth, halfHeight }) => {
        const plant = plants.find(p => p.plot === plot);
        const species = plant && GARDEN_SPECIES.find(s => s.id === plant.speciesId);
        const label = `Parcela ${plot + 1}: ${plant && species ? `${species.name}, ${stages[plant.stage]}` : onSelect ? "vacía, plantar" : "sin plantar"}`;
        return <g key={plot} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
          aria-label={label} aria-pressed={onSelect ? selected === plot : undefined} data-garden-plot={plot} data-plot-x={x} data-plot-y={y}
          onClick={onSelect ? () => onSelect(plot) : undefined}
          onKeyDown={onSelect ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(plot); } } : undefined}
          className={onSelect ? "forest-parcel cursor-pointer outline-none" : ""}>
          <title>{label}</title>
          <path d={`M${x} ${y - halfHeight}l${halfWidth} ${halfHeight}-${halfWidth} ${halfHeight}-${halfWidth}-${halfHeight}Z`} fill={selected === plot ? "var(--garden-plot-selected)" : "transparent"}
            stroke={selected === plot ? "var(--garden-plot-ink)" : onSelect ? "var(--garden-grass-edge)" : "transparent"} strokeOpacity={selected === plot ? 1 : .28} strokeWidth={selected === plot ? 2.5 : .7} />
          {species?.habitat ? <g pointerEvents="none" aria-hidden="true">
            <ellipse cx={x} cy={y + 3} rx={halfWidth * .68} ry={halfHeight * .47} fill={species.habitat === "water" ? "#6ab6bc" : "#78a56a"} />
            <path d={`M${x - halfWidth * .5} ${y + 4}q7 3 13 0m10 4q6 2 10-2`} fill="none" stroke="#d3efe3" strokeWidth="1.2" opacity=".7" />
          </g> : null}
          {plant && species ? <><ellipse aria-hidden="true" pointerEvents="none" cx={x} cy={y+1} rx={halfWidth*.4} ry={4} fill="#254c2d" opacity=".2"/><TreeArt species={species} stage={plant.stage} variant={plot} viewport={{ x: x - halfWidth*.95, y: y - halfWidth*2, width: halfWidth*1.9, height: halfWidth*2.14 }} /></> : onSelect ?
            <g pointerEvents="none" opacity=".6" stroke="var(--garden-plot-ink)" strokeWidth="1.3"><path d={`M${x - 3} ${y}h6m-3-3v6`} /></g> : null}
        </g>;
      })}
      <GardenBridge layout={layout} />
    </svg>
    {!plants.length ? <p className="px-4 pb-4 text-center text-sm text-muted">{onSelect ? "Tu bosque empieza con una semilla." : "Este rincón recién empieza. Todavía no hay plantas."}</p> : null}
    {onSelect ? <div className="px-2 pb-4 sm:px-5"><PlotPicker plants={plants} selected={selected} onSelect={onSelect} plotCount={layout.count} /></div> : null}
  </div>;
}
