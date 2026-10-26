import { useId } from "react";
import type { GardenPlant, GardenSpecies } from "@sala/contracts";
import { treeColor, treeGeometry } from "./tree-geometry";

/** Botanical vector art: directional light and roots anchored at y=99 in every stage. */
export function TreeArt({ species, stage = "mature", decorative = true, variant = 0 }: {
  species: GardenSpecies;
  stage?: GardenPlant["stage"];
  decorative?: boolean;
  variant?: number;
}) {
  const id = useId().replace(/:/g, "");
  const art = treeGeometry(species.id, variant);
  const scale = stage === "young" ? .7 : 1;
  const green = [treeColor(species.foliage,"#0b281d",.46), treeColor(species.foliage,"#143723",.18), species.foliage, treeColor(species.foliage,"#d6dfa6",.3)];
  const floral = species.flower ?? species.foliage;
  const flowers = [treeColor(floral,"#623b60",.2), floral, treeColor(floral,"#fff3dc",.3)];
  return <svg viewBox="0 0 96 110" width="96" height="110" aria-hidden={decorative || undefined}
    role={decorative ? undefined : "img"} aria-label={decorative ? undefined : species.name}
    data-tree-species={species.id} data-tree-stage={stage} className="h-full w-full overflow-visible">
    <defs>
      <linearGradient id={`${id}-bark`} x1="0" y1="0" x2="1" y2="0">
        <stop stopColor={treeColor(species.bark,"#e1d4aa",.26)} /><stop offset=".45" stopColor={species.bark} /><stop offset="1" stopColor={treeColor(species.bark,"#252b23",.48)} />
      </linearGradient>
      <radialGradient id={`${id}-shadow`}><stop stopColor="#0b281d" stopOpacity=".23" /><stop offset="1" stopColor="#0b281d" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-crown`} x1=".1" y1="0" x2=".7" y2="1"><stop stopColor={green[1]} /><stop offset="1" stopColor={green[0]} /></linearGradient>
      <clipPath id={`${id}-trunk`}><path d={art.trunk} /></clipPath>
    </defs>
    <ellipse cx="49" cy="100" rx={stage === "seed" ? 10 : 29*scale} ry="5" fill={`url(#${id}-shadow)`} />
    {stage === "seed" ? <g>
      <path d="M37 99q10-7 22 0Z" fill="#806749" />
      <path d="M48 98q-2-6 0-12" fill="none" stroke={green[1]} strokeWidth="1.4" />
      <path d="M47 91q-9 1-10-7 8-2 10 7M48 88q8 0 9-8-8-1-9 8Z" fill={green[2]} />
      <path d="m40 86 6 4m8-7-5 4" stroke={green[3]} strokeWidth=".5" />
    </g> : stage === "sprout" ? <g>
      <path d="M45 99q4-14 2-33l2-3q0 22 3 36Z" fill={`url(#${id}-bark)`} />
      <path d="m48 87-12-12m12 4 12-11m-12 4-7-13" fill="none" stroke={species.bark} strokeWidth="1.1" />
      {species.id === "pehuen" ? <path d="m48 69-13 4 6-6-8-2 13-3-7-5 10 3 8-5-4 7 12 4-10 2 7 5-12-3m-1 12-16 2 6-4-9-2 17-3 15 4-9 1 8 5-14-2Z" fill={green[2]} /> : <>
        <path d="M38 78q-13-3-10-14 11-1 10 14M58 72q-1-14 11-14 2 11-11 14M43 65q-9-2-8-11 9 1 8 11M49 66q-2-13 7-16 5 9-7 16Z" fill={green[2]} />
        <path d="m30 66 7 10m29-15-7 10m-21-14 4 7m12-12-4 11" stroke={green[3]} fill="none" strokeWidth=".7" />
      </>}
    </g> : <g transform={`translate(${48*(1-scale)} ${99*(1-scale)}) scale(${scale})`}>
      <path d={art.trunk} fill={`url(#${id}-bark)`} />
      {art.branches.map((d,i) => <g key={i} fill="none" strokeLinecap="round"><path d={d} stroke={treeColor(species.bark,"#292c24",.22)} strokeWidth={i%2 ? 2.5 : 3.6} /><path d={d} stroke={treeColor(species.bark,"#e0c398",.2)} strokeWidth=".8" /></g>)}
      <path d={art.barkMarks} clipPath={`url(#${id}-trunk)`} stroke={treeColor(species.bark,"#251d1b",.5)} strokeWidth=".65" fill="none" opacity=".65" />
      {species.id === "chanar" || species.id === "arrayan" ? <path d="m46 77 2-6 1 8-2 5m2 1 2 6-3 4m-4-29 2-7 1 6" stroke={treeColor(species.bark,"#e9cb8d",.5)} strokeWidth="2" fill="none" /> : null}
      {species.id === "palo-borracho" ? <path d="m40 73-3 2 4 1m17-5 4 2-4 1m-15 9-3 2 4 1m7-18 2-3 1 4" fill={green[0]} /> : null}
      <path d="m43 96-8 4m15-4 11 4m-13-3-2 5" stroke={species.bark} strokeWidth="1.5" fill="none" />
      <g className="garden-tree-crown">
        <g fill={`url(#${id}-crown)`} opacity={species.id === "lapacho" ? .45 : .95}>{art.crown.map((d,i) => <path key={i} d={d} />)}</g>
        {art.trailing ? <path d={art.trailing} fill="none" stroke={green[1]} strokeWidth=".9" /> : null}
        {art.leaves.map((d,i) => <path key={i} d={d} fill={green[i]} opacity={species.id === "lapacho" ? .6 : 1} />)}
        {species.flower && stage === "mature" ? art.blossoms.map((d,i) => <path key={i} d={d} fill={flowers[i]} />) : null}
      </g>
    </g>}
  </svg>;
}
