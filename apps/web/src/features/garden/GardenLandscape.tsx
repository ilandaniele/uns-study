import { useId } from "react";
import type { GardenBiomeId } from "@sala/contracts";
import { polygonPoints, type GardenLayout, type GardenPoint } from "./garden-layout";
import styles from "./garden-scene.module.css";

const MATERIALS: Record<GardenBiomeId, number> = { pampa: 0, ribera: 1, espinal: 2, andino: 3 };
const MATERIAL = "/garden/suelos-nativos-gpt-v2.webp";
const DETAILS = "/garden/orillas-nativas-gpt-v2.webp";

/** Border scenery never represents plants earned by the owner. */
function BorderDetail({ point, frame, size = 40 }: { point: GardenPoint; frame: number; size?: number }) {
  return <svg x={point.x-size/2} y={point.y-size*270/256} width={size} height={size*288/256}
    viewBox={[frame%3*256, Math.floor(frame/3)*288, 256, 288].join(" ")} overflow="hidden" data-garden-scenery>
    <image href={DETAILS} width="768" height="576" />
  </svg>;
}

/** Textured meadow with eroded shores, without floating blocks or bridges. */
export function GardenLandscape({ layout, biome }: { layout: GardenLayout; biome: GardenBiomeId }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const material = MATERIALS[biome];
  const patternX = material%2*512, patternY = Math.floor(material/2)*512;
  const land = layout.banks.map(bank => "M"+polygonPoints(bank).replaceAll(" ", " L")+"Z");
  const shores = [layout.channel.slice(0,121), layout.channel.slice(121).reverse()];
  const decorFrames = biome === "espinal" ? [0,2,2,4] : biome === "andino" ? [3,5,0,5] : biome === "ribera" ? [1,5,3,1] : [2,4,0,4];
  return <g aria-hidden="true" pointerEvents="none" data-garden-landscape="natural-v2">
    <defs>
      <pattern id={"ground-"+id} patternUnits="userSpaceOnUse" width="210" height="210" patternTransform="matrix(1 .52 -1 .52 300 100)">
        <svg viewBox={[patternX,patternY,512,512].join(" ")} width="210" height="210" overflow="hidden"><image href={MATERIAL} width="1024" height="1024" /></svg>
      </pattern>
      <linearGradient id={"light-"+id} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#e9efcc" stopOpacity=".18"/><stop offset=".55" stopColor="#718765" stopOpacity="0"/><stop offset="1" stopColor="#182a22" stopOpacity=".16"/></linearGradient>
      <linearGradient id={"water-"+id} x1="0" y1="0" x2="1" y2=".8"><stop stopColor="var(--garden-water-light)"/><stop offset=".42" stopColor="var(--garden-water-deep)"/><stop offset=".78" stopColor="var(--garden-water-light)"/><stop offset="1" stopColor="var(--garden-water-deep)"/></linearGradient>
      <pattern id={"ripples-"+id} width="96" height="57" patternUnits="userSpaceOnUse"><path d="M4 11q12-2 21 0m26 21q9 2 18-1M24 46q7 1 16-1m38-29 11-1" fill="none" stroke="#e5f2e7" strokeWidth=".65" strokeLinecap="round"/></pattern>
      <clipPath id={"channel-"+id}><path d={layout.riverShape}/></clipPath>
      {land.map((path,i)=><clipPath key={i} id={"land-"+id+"-"+i}><path d={path}/></clipPath>)}
    </defs>
    {land.map((path,i)=><g key={i}>
      <path d={path} fill="var(--garden-earth-dark)" stroke="var(--garden-earth-dark)" strokeWidth="5" strokeLinejoin="round" opacity=".28" transform="translate(0 2)"/>
      <path d={path} fill={"url(#ground-"+id+")"}/>
      <path d={path} fill={"url(#light-"+id+")"}/>
      <g clipPath={"url(#land-"+id+"-"+i+")"}>
        {layout.plots.filter(p=>p.bank===i).map(p=><ellipse key={p.plot} cx={p.x-9} cy={p.y+7} rx={p.halfWidth*.58} ry={p.halfHeight*.38} fill={p.plot%3 ? "#b7bf94" : "#172c20"} opacity={p.plot%3 ? ".035" : ".045"}/>)}
      </g>
    </g>)}
    <path d={layout.riverShape} fill={"url(#ground-"+id+")"} stroke="var(--garden-river-bank)" strokeWidth="3" strokeLinejoin="round"/>
    <path data-garden-river d={layout.riverShape} fill={"url(#water-"+id+")"} opacity=".86"/>
    <g clipPath={"url(#channel-"+id+")"}>
      <path d={layout.riverPath} fill="none" stroke="var(--garden-water-deep)" strokeWidth="9" opacity=".15"/>
      <rect data-river-surface className={styles.surface} x="-96" y="-57" width="792" height="544" fill={"url(#ripples-"+id+")"}/>
      <path data-river-flow className={styles.flow} d={layout.riverPath} fill="none" stroke="#d2e6da" strokeWidth=".8" strokeDasharray="3 29 10 42" strokeLinecap="round" opacity=".2"/>
      {layout.river.filter((_,n)=>n%17===6).map((p,n)=><ellipse key={n} cx={p.x+2} cy={p.y+1} rx={n%2?2.7:1.7} ry=".9" fill="var(--garden-river-stone)" opacity=".2"/>)}
    </g>
    {shores.flatMap((shore,side)=>[.12,.34,.61,.84].map((t,n)=><BorderDetail key={side+"-"+n} point={shore[Math.round(t*(shore.length-1))]!} frame={decorFrames[(n+side)%decorFrames.length]!} size={n%2 ? 34 : 42}/>))}
    {layout.banks.flatMap((bank,side)=>bank.filter((_,n)=>n%Math.floor(bank.length/5)===0).map((point,n)=><BorderDetail key={"edge-"+side+"-"+n} point={point} frame={decorFrames[(n+2)%decorFrames.length]!} size={n%2 ? 30 : 38}/>))}
  </g>;
}
