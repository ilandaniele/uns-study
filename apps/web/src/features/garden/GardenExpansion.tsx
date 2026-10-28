"use client";
import { useState } from "react";
import { ArrowsOutIcon, LeafIcon } from "@phosphor-icons/react/dist/ssr";
import { GARDEN_SIZE, gardenExpansion, type GardenDto } from "@sala/contracts";

export function GardenExpansion({garden,pending,onExpand}: {garden:GardenDto;pending:boolean;onExpand:()=>Promise<boolean>}) {
  const [confirm,setConfirm]=useState(false);
  const count=garden.plotCount??GARDEN_SIZE;
  const next=gardenExpansion(count);
  if(!next)return <p className="mt-4 text-center text-xs text-muted">Tu jardín ya tiene sus {count} parcelas.</p>;
  const ready=garden.plants.length>=next.requiredPlants;
  const enough=garden.seeds>=next.cost;
  return <section aria-label="Ampliar jardín" className="mt-4 rounded-2xl border border-app bg-surface p-4">
    <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ArrowsOutIcon size={20} aria-hidden="true"/></span><div><h3 className="text-sm font-semibold">Un poco más de jardín</h3><p className="mt-1 text-xs text-muted">{ready ? `Sumá cinco parcelas · ${count} → ${count+next.plots}` : `Plantá ${next.requiredPlants} parcelas para poder ampliar · ${garden.plants.length}/${next.requiredPlants}`}</p></div></div>
    {ready ? <>
      {confirm ? <p className="mt-3 text-sm">Ampliar a {count+next.plots} parcelas cuesta <strong>{next.cost} semillas</strong>.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pending||!enough} onClick={()=>{if(confirm)void onExpand().then(ok=>{if(ok)setConfirm(false);});else setConfirm(true);}} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-45"><LeafIcon size={17} aria-hidden="true"/>{pending ? "Ampliando…" : confirm ? "Confirmar ampliación" : `Ampliar · ${next.cost} semillas`}</button>{confirm ? <button type="button" disabled={pending} onClick={()=>setConfirm(false)} className="min-h-11 rounded-full border border-app px-4 text-sm">Cancelar</button> : null}</div>
      {!enough ? <p className="mt-2 text-xs text-muted">Te faltan {next.cost-garden.seeds} semillas.</p> : null}
    </> : <progress className="garden-progress mt-3 h-1.5 w-full" aria-label="Parcelas plantadas para habilitar la ampliación" value={garden.plants.length} max={next.requiredPlants}/>}
  </section>;
}
