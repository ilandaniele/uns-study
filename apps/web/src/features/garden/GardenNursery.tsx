"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CaretDownIcon, LeafIcon } from "@phosphor-icons/react/dist/ssr";
import { GARDEN_SPECIES, type GardenSpecies } from "@sala/contracts";
import { TreeArt } from "./TreeArt";
const hours = (minutes: number) => `${Number((minutes/60).toFixed(1)).toLocaleString("es-AR")} h`;
const FILTERS = [
 {id:"all",label:"Todas"},{id:"tree",label:"Árboles"},{id:"palm",label:"Palmeras"},
 {id:"flowers",label:"Flores y yuyos"},{id:"grass",label:"Pastos"},{id:"cactus",label:"Cactus"},{id:"aquatic",label:"Acuáticas"},
] as const;
type Filter = typeof FILTERS[number]["id"];
const featured=["santa-lucia","flechilla","petunia-blanca","saeta","plumerillo-rosado"];
const species=[...featured.map(id=>GARDEN_SPECIES.find(s=>s.id===id)!),...GARDEN_SPECIES.filter(s=>!featured.includes(s.id))];
export function GardenNursery({collection,selected,onChoose}: {collection:Record<string,number>;selected:string;onChoose:(s:GardenSpecies)=>void}) {
 const [filter,setFilter]=useState<Filter>("all"),[expanded,setExpanded]=useState(false);
 const [headerHeight,setHeaderHeight]=useState(64);
 const section=useRef<HTMLElement>(null),heading=useRef<HTMLDivElement>(null);
 const restore=useRef(false);
 const items=species.filter(s=>filter==="all" || (filter==="flowers" ? s.kind==="flower" || s.kind==="shrub" : (s.kind??"tree")===filter));
 useEffect(()=>{const header=document.querySelector("header");if(!header)return;const measure=()=>setHeaderHeight(header.getBoundingClientRect().height);measure();const observer=new ResizeObserver(measure);observer.observe(header);return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{if(restore.current && section.current){window.scrollTo({top:window.scrollY+section.current.getBoundingClientRect().top-headerHeight-8,behavior:"instant"});restore.current=false;}},[filter,expanded,headerHeight]);
 function change(next:Filter){restore.current=(heading.current?.getBoundingClientRect().top??Infinity)<=headerHeight+10;setFilter(next);setExpanded(false);}
 const cards=(list:readonly GardenSpecies[])=>list.map(s=><SpeciesCard key={s.id} species={s} count={collection[s.id]??0} selected={s.id===selected} onChoose={()=>onChoose(s)}/>);
 return <section ref={section} aria-labelledby="nursery-title" className="mt-9 [overflow-anchor:none]" style={{"--nursery-top":`${headerHeight+8}px`} as CSSProperties}>
   <div ref={heading} className="sticky top-[var(--nursery-top)] z-20 mb-4 rounded-2xl border border-app bg-surface/95 p-3 shadow-sm backdrop-blur sm:p-4">
     <div className="flex items-center justify-between gap-3"><div><p className="t-label text-primary">De acá, de Argentina</p><h2 id="nursery-title" className="mt-1 scroll-mt-32 text-xl font-bold sm:text-2xl">El vivero nativo</h2></div><span className="text-right text-xs text-muted">{items.length} especies</span></div>
     <div role="group" aria-label="Tipos de plantas" className="mt-3 flex gap-2 overflow-x-auto pb-1">
       {FILTERS.map(item=><button key={item.id} type="button" aria-pressed={filter===item.id} onClick={()=>change(item.id)} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold ${filter===item.id ? "border-primary bg-primary text-white" : "border-app bg-surface-2 text-muted hover:border-primary"}`}>{item.label}</button>)}
     </div>
   </div>
   <div id="nursery-plants" data-nursery-expanded={expanded}>
     <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{cards(expanded?items:items.slice(0,5))}</div>
     {!expanded && items.length>5 ? <div className="relative mt-3">
       <div aria-hidden="true" inert className="pointer-events-none max-h-36 select-none overflow-hidden sm:max-h-40"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{cards(items.slice(5,10))}</div></div>
       <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/50 to-[var(--bg)]"/>
       <div className="absolute inset-x-0 bottom-1 flex justify-center"><button type="button" aria-expanded="false" aria-controls="nursery-plants" onClick={()=>setExpanded(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app bg-surface px-5 text-sm font-semibold text-primary shadow-lg">Ver las {items.length} especies <CaretDownIcon size={17} aria-hidden="true"/></button></div>
     </div> : expanded && items.length>5 ? <button type="button" aria-expanded="true" aria-controls="nursery-plants" className="mx-auto mt-5 flex min-h-11 items-center rounded-full border border-app bg-surface px-5 text-sm font-semibold text-primary" onClick={()=>{restore.current=true;setExpanded(false);heading.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")?.focus({preventScroll:true});}}>Mostrar sólo las primeras cinco</button> : null}
   </div>
 </section>;
}

function SpeciesCard({
  species,
  count,
  selected,
  onChoose,
}: {
  species: GardenSpecies;
  count: number;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <article
      className={`flex min-w-0 flex-col rounded-2xl border bg-surface p-3 sm:p-4 ${selected ? "border-[var(--primary)]" : "border-app"}`}
    >
      <div className="garden-specimen relative mb-3 flex aspect-[4/3] items-center justify-center rounded-xl">
        <div className="h-full w-36 max-w-[85%] sm:w-40">
          <TreeArt species={species} />
        </div>
        {count ? (
          <span className="absolute right-2 top-2 rounded-full bg-surface px-2 py-1 text-[10px] font-semibold">
            ×{count}
          </span>
        ) : null}
      </div>
      <h3 className="text-sm font-bold">{species.name}</h3>
      <p className="mt-1 text-xs text-muted">{species.region}</p>
      <p className="mb-4 mt-2 text-xs text-muted">
        {hours(species.growthMinutes)} de crecimiento
      </p>
      <button
        type="button"
        onClick={onChoose}
        className="mt-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-app px-2 text-xs font-semibold text-primary hover:bg-surface-2"
      >
        <LeafIcon size={14} aria-hidden="true" />
        {species.cost} semillas
      </button>
    </article>
  );
}
