"use client";

import { useEffect, useRef } from "react";
import { CaretDownIcon, CheckIcon, PlantIcon, SquaresFourIcon } from "@phosphor-icons/react/dist/ssr";
import { GARDEN_SIZE, GARDEN_SPECIES, type SharedGardenDto } from "@sala/contracts";

/** A small inline map of the plots: native buttons, no browser-owned option list. */
export function PlotPicker({ plants, selected, onSelect, plotCount = GARDEN_SIZE }: {
  plants: SharedGardenDto["plants"];
  selected?: number | null;
  onSelect: (plot: number) => void;
  plotCount?: number;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const chosen = selected != null;
  const occupied = plants.some(plant => plant.plot === selected);

  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [selected]);

  function close() {
    if (details.current) details.current.open = false;
    summary.current?.focus({ preventScroll: true });
  }

  return <details ref={details} className="group/plots mx-auto w-full max-w-sm rounded-2xl border border-app bg-surface"
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <summary ref={summary} aria-label={chosen ? `Elegir parcela: parcela ${selected + 1}, ${occupied ? "plantada" : "disponible"}` : "Elegir parcela"}
      className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-3 py-2.5 text-sm outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><SquaresFourIcon size={20} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block font-semibold text-main">{chosen ? `Parcela ${selected + 1}` : "Elegir parcela"}</span><span className="mt-0.5 block text-xs text-muted">{chosen ? occupied ? "Plantada · ver árbol" : "Disponible para plantar" : `${plotCount} casillas para tu bosque`}</span></span>
      <CaretDownIcon size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform group-open/plots:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="border-t border-app p-2.5">
      <div ref={grid} role="group" aria-label="Parcelas del jardín" className="grid grid-cols-5 gap-1"
        onKeyDown={event => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-plot]");
          if (!button) return;
          const current = Number(button.dataset.plot);
          const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
          const next = event.key === "Home" ? 0 : event.key === "End" ? plotCount - 1 : event.key in moves ? (current + moves[event.key] + plotCount) % plotCount : null;
          if (next == null) return;
          event.preventDefault();
          grid.current?.querySelector<HTMLButtonElement>(`[data-plot="${next}"]`)?.focus();
        }}>
        {Array.from({ length: plotCount }, (_, plot) => {
          const plant = plants.find(p => p.plot === plot);
          const species = plant && GARDEN_SPECIES.find(s => s.id === plant.speciesId);
          const active = selected === plot;
          const label = `Parcela ${plot + 1}: ${plant ? `plantada${species ? `, ${species.name}` : ""}` : "disponible"}`;
          return <button key={plot} type="button" data-plot={plot} aria-label={label} title={label} aria-pressed={active}
            onClick={() => { close(); onSelect(plot); }}
            className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${active ? "border-primary bg-primary text-white" : plant ? "border-primary/25 bg-primary/10 text-primary hover:border-primary" : "border-app bg-surface-2 text-muted hover:border-primary hover:text-main"}`}>
            <span>{plot + 1}</span>
            {plant ? <PlantIcon size={11} weight="fill" aria-hidden="true" /> : null}
            {active ? <CheckIcon size={10} weight="bold" aria-hidden="true" className="absolute right-1 top-1" /> : null}
          </button>;
        })}
      </div>
      <p className="mt-2 px-1 text-center text-[11px] text-muted">{plotCount - plants.length} disponibles · {plants.length} plantadas</p>
    </div>
  </details>;
}
