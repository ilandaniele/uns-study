import { useId, useMemo } from "react";
import type { GardenBiomeId } from "@sala/contracts";
import { polygonPoints, type GardenLayout } from "./garden-layout";
import styles from "./garden-scene.module.css";
import { GARDEN_MATERIALS } from "./garden-materials";
import { createGardenScenery, type GardenScenery } from "./garden-scenery";

const DETAILS = "/garden/orillas-nativas-gpt-v2.webp";
const WATER = "/garden/agua-arroyo-gpt-v3.webp";

/** Border scenery never represents plants earned by the owner. */
function BorderDetail({ detail }: { detail: GardenScenery }) {
  const {x,y,frame,size,bank}=detail;
  return <g data-scenery-x={x} data-scenery-y={y} data-scenery-size={size} data-scenery-bank={bank}>
    <ellipse cx={x} cy={y-1} rx={size*.27} ry={size*.07} fill="#172a20" opacity=".18"/>
    <svg x={x-size/2} y={y-size*270/256} width={size} height={size*288/256}
    viewBox={[frame%3*256, Math.floor(frame/3)*288, 256, 288].join(" ")} overflow="hidden" data-garden-scenery>
    <image href={DETAILS} width="768" height="576" />
  </svg></g>;
}

/** Textured meadow with eroded shores, without floating blocks or bridges. */
export function GardenLandscape({ layout, biome }: { layout: GardenLayout; biome: GardenBiomeId }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const material = GARDEN_MATERIALS[biome];
  const patternX = material.frame%material.columns*512, patternY = Math.floor(material.frame/material.columns)*512;
  const scenery=useMemo(()=>createGardenScenery(layout,material.decor),[layout,material]);
  const land = layout.banks.map(bank => "M"+polygonPoints(bank).replaceAll(" ", " L")+"Z");
  return <g aria-hidden="true" pointerEvents="none" data-garden-landscape="river-v3">
    <defs>
      <pattern id={"ground-"+id} patternUnits="userSpaceOnUse" width="210" height="210" patternTransform="matrix(1 .52 -1 .52 300 100)">
        <svg viewBox={[patternX,patternY,512,512].join(" ")} width="210" height="210" overflow="hidden"><image href={material.file} width={material.columns*512} height={material.rows*512} /></svg>
      </pattern>
      <pattern id={"bed-"+id} patternUnits="userSpaceOnUse" width="128" height="64"><svg viewBox="0 0 512 512" width="128" height="64" preserveAspectRatio="none" overflow="hidden"><image href={WATER} width="1024" height="512"/></svg></pattern>
      <pattern id={"reflection-"+id} patternUnits="userSpaceOnUse" width="192" height="128"><svg viewBox="512 0 512 512" width="192" height="128" preserveAspectRatio="none" overflow="hidden"><image href={WATER} width="1024" height="512"/></svg></pattern>
      <pattern id={"current-"+id} patternUnits="userSpaceOnUse" width="128" height="64"><svg viewBox="512 0 512 512" width="128" height="64" preserveAspectRatio="none" overflow="hidden"><image href={WATER} width="1024" height="512"/></svg></pattern>
      <linearGradient id={"light-"+id} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#e9efcc" stopOpacity=".18"/><stop offset=".55" stopColor="#718765" stopOpacity="0"/><stop offset="1" stopColor="#182a22" stopOpacity=".16"/></linearGradient>
      <linearGradient id={"water-"+id} x1="0" y1="0" x2="1" y2=".8"><stop stopColor="var(--garden-water-light)"/><stop offset=".42" stopColor="var(--garden-water-deep)"/><stop offset=".78" stopColor="var(--garden-water-light)"/><stop offset="1" stopColor="var(--garden-water-deep)"/></linearGradient>
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
    <path d={layout.riverShape} fill="var(--garden-river-bank)" stroke="var(--garden-river-bank)" strokeWidth="1.5" strokeLinejoin="round" opacity=".7"/>
    <path data-garden-river d={layout.riverShape} fill={"url(#bed-"+id+")"}/>
    <path d={layout.riverShape} fill={"url(#water-"+id+")"} opacity=".22"/>
    <g clipPath={"url(#channel-"+id+")"}>
      <rect data-river-surface className={styles.surface} x="-192" y="-128" width="984" height="686" fill={"url(#reflection-"+id+")"}/>
      <rect data-river-flow className={styles.flow} x="-128" y="-64" width="856" height="558" fill={"url(#current-"+id+")"}/>
    </g>
    {scenery.map((detail,index)=><BorderDetail key={index} detail={detail}/>)}
  </g>;
}
