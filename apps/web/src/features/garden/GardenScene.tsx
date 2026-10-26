"use client";

import { GARDEN_SIZE, GARDEN_SPECIES, type SharedGardenDto } from "@sala/contracts";
import { TreeArt } from "./TreeArt";

const stages = { seed: "semilla", sprout: "brote", young: "joven", mature: "adulto" };

/** Original upright tree illustrations on a depth-sorted isometric island. */
export function GardenScene({ plants, selected, onSelect }: {
  plants: SharedGardenDto["plants"];
  selected?: number | null;
  onSelect?: (plot: number) => void;
}) {
  const plots = Array.from({ length: GARDEN_SIZE }, (_, plot) => ({ plot, row: Math.floor(plot / 5), col: plot % 5 }))
    .sort((a, b) => a.row + a.col - b.row - b.col || a.row - b.row);
  return <div className="forest-diorama relative isolate overflow-hidden rounded-3xl">
    <svg viewBox="0 0 600 430" width="600" height="430" className="block h-auto w-full" role="group" aria-label="Bosque nativo: 25 parcelas">
      <ellipse cx="300" cy="363" rx="205" ry="19" fill="var(--garden-empty)" opacity=".12" />
      <path d="M60 205 300 330 540 205v22L300 353 60 227Z" fill="#9d8057" />
      <path d="m300 330 240-125v22L300 353Z" fill="#826945" />
      <path d="m300 80 240 125-240 125L60 205Z" fill="var(--garden-soil)" stroke="var(--garden-tile-border)" strokeWidth="2" />
      {plots.map(({ plot, row, col }) => {
        const plant = plants.find(p => p.plot === plot);
        const species = plant && GARDEN_SPECIES.find(s => s.id === plant.speciesId);
        const x = 300 + (col - row) * 48;
        const y = 105 + (col + row) * 25;
        const label = `Parcela ${plot + 1}: ${plant && species ? `${species.name}, ${stages[plant.stage]}` : "vacía, plantar"}`;
        return <g key={plot} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
          aria-label={label} aria-pressed={onSelect ? selected === plot : undefined}
          onClick={onSelect ? () => onSelect(plot) : undefined}
          onKeyDown={onSelect ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(plot); } } : undefined}
          className={onSelect ? "forest-parcel cursor-pointer outline-none" : ""}>
          <title>{label}</title>
          <path d={`M${x} ${y - 25}l48 25-48 25-48-25Z`} fill={selected === plot ? "var(--garden-accent)" : (row + col) % 2 ? "var(--garden-tile)" : "var(--garden-soil)"}
            stroke={selected === plot ? "var(--garden-accent)" : "var(--garden-tile-border)"} strokeWidth={selected === plot ? 3 : 1} />
          {plant && species ? <svg x={x - 34} y={y - 74} width="68" height="78" className="pointer-events-none overflow-visible"><TreeArt species={species} stage={plant.stage} variant={plot} /></svg> :
            <g pointerEvents="none" opacity=".45" stroke="var(--garden-empty)" strokeWidth="2"><path d={`M${x - 5} ${y}h10m-5-5v10`} /></g>}
        </g>;
      })}
      <g fill="var(--garden-empty)" opacity=".4"><path d="m99 306 4-7 3 8 5-5-2 10M480 125l3-9 4 10 5-4-3 11" /></g>
    </svg>
    {!plants.length ? <p className="absolute inset-x-4 bottom-5 text-center text-sm text-muted">Tu bosque empieza con una semilla.</p> : null}
    {onSelect ? <div className="px-5 pb-5"><label className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">Elegir parcela
      <select aria-label="Elegir parcela" value={selected ?? ""} onChange={e => onSelect(Number(e.target.value))} className="min-h-11 max-w-full rounded-full border border-app bg-surface px-4 text-sm text-main">
        <option value="" disabled>Tocá una parcela</option>{Array.from({ length: GARDEN_SIZE }, (_, i) => <option key={i} value={i}>Parcela {i + 1} · {plants.some(p => p.plot === i) ? "plantada" : "disponible"}</option>)}
      </select></label></div> : null}
  </div>;
}
