import { useId } from "react";
import { polygonPoints, type GardenLayout } from "./garden-layout";
/** Original layered island drawing. Decorations never intercept planting or keyboard input. */
export function GardenLandscape({layout}: {layout: GardenLayout}) {
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const bottom=Math.max(...layout.plots.map(p=>p.y+p.halfHeight));
  return <g aria-hidden="true" pointerEvents="none">
    <defs>
      <linearGradient id={`grass-${id}`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="var(--garden-tile)"/><stop offset="1" stopColor="var(--garden-soil)"/></linearGradient>
      <linearGradient id={`water-${id}`} x1="0" x2="1"><stop stopColor="var(--garden-water-deep)"/><stop offset=".45" stopColor="var(--garden-water)"/><stop offset="1" stopColor="var(--garden-water-deep)"/></linearGradient>
      <pattern id={`grass-grain-${id}`} width="19" height="15" patternUnits="userSpaceOnUse"><path d="m3 8 1-3 2 4m8-2 2-2m-7 8 2-2" stroke="var(--garden-empty)" strokeWidth=".7" opacity=".14" fill="none"/></pattern>
    </defs>
    <ellipse cx="300" cy={bottom+32} rx="222" ry="16" fill="#09170d" opacity=".12"/>
    {layout.banks.map((bank,i)=><g key={i}>
      <polygon points={polygonPoints(bank.map(p=>({...p,y:p.y+16})))} fill={i ? "#94754f" : "#ae9061"}/>
      <polygon points={polygonPoints(bank)} fill={`url(#grass-${id})`} stroke="var(--garden-tile-border)" strokeWidth="1.3" strokeLinejoin="round"/>
      <polygon points={polygonPoints(bank)} fill={`url(#grass-grain-${id})`}/>
      <polyline points={polygonPoints(bank.slice(0,3))} fill="none" stroke="var(--garden-accent)" strokeOpacity=".23" strokeWidth="2"/>
    </g>)}
    <path d={layout.riverPath} fill="none" stroke="var(--garden-water-deep)" strokeWidth="22" strokeLinecap="round"/>
    <path d={layout.riverPath} fill="none" stroke={`url(#water-${id})`} strokeWidth="16" strokeLinecap="round"/>
    <path className="garden-stream-current" d={layout.riverPath} fill="none" stroke="var(--garden-water-light)" strokeWidth="1.4" strokeDasharray="8 20" opacity=".65"/>
    <g fill="var(--garden-empty)" opacity=".4"><path d={`M82 ${bottom-24}l3-7 3 8 4-5-1 9m410-170 2-8 4 8 4-3-2 8`}/></g>
    <g fill="#8d9981" opacity=".55"><ellipse cx="91" cy={bottom+4} rx="5" ry="2.5"/><ellipse cx="102" cy={bottom+5} rx="3" ry="1.7"/></g>
  </g>;
}
export function GardenBridge({layout}: {layout: GardenLayout}) {
  const {x,y,angle}=layout.bridge;
  return <g aria-hidden="true" pointerEvents="none" transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect x="-20" y="-6" width="40" height="15" rx="2" fill="#694d35"/>
    <rect x="-20" y="-8" width="40" height="13" rx="2" fill="#c4a572" stroke="#856343"/>
    {[-14,-7,0,7,14].map(p=><path key={p} d={`M${p} -7v11`} stroke="#8e6e47" strokeWidth=".9"/>)}
    <path d="M-20-8H20M-20 5H20" stroke="#e0c491" strokeWidth="1.4"/>
  </g>;
}
