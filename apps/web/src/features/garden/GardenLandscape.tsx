import { useId } from "react";
import { polygonPoints, type GardenLayout } from "./garden-layout";

/** Small landscape details are decoration, never earned plants or extra plots. */
export function GardenLandscape({ layout }: { layout: GardenLayout }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const bottom = Math.max(...layout.plots.map(p => p.y + p.halfHeight));
  return <g aria-hidden="true" pointerEvents="none">
    <defs>
      <linearGradient id={`grass-${id}`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="var(--garden-grass-light)" /><stop offset="1" stopColor="var(--garden-grass)" /></linearGradient>
      <linearGradient id={`water-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="430"><stop stopColor="#88c5bb" /><stop offset=".5" stopColor="#60a9ac" /><stop offset="1" stopColor="#3b8191" /></linearGradient>
      <pattern id={`ripples-${id}`} width="32" height="19" patternUnits="userSpaceOnUse"><path d="M2 5q4 2 9 0m8 9q3 1 6-1" fill="none" stroke="#d5f5e9" strokeWidth="1.1" strokeLinecap="round" /></pattern>
      <radialGradient id={`shadow-${id}`}><stop stopColor="#102418" stopOpacity=".3" /><stop offset="1" stopColor="#102418" stopOpacity="0" /></radialGradient>
      <clipPath id={`channel-${id}`}><path d={layout.riverShape} /></clipPath>
      {layout.banks.map((bank, i) => <clipPath key={i} id={`bank-${id}-${i}`}><polygon points={polygonPoints(bank)} /></clipPath>)}
    </defs>
    <ellipse cx="300" cy={bottom + 30} rx="240" ry="27" fill={`url(#shadow-${id})`} />
    {layout.banks.map((bank, i) => {
      return <g key={i}>
        {layout.earthFaces[i]!.map((face, n) => <polygon key={n} data-garden-earth-face points={polygonPoints([...face.edge, ...[...face.edge].reverse().map(p => ({ x: p.x, y: p.y + 16 }))])} fill={face.light ? "#927347" : "#78603d"} />)}
        {bank.map((a, edge) => {
          const b = bank[(edge + 1) % bank.length]!;
          if (b.x >= a.x) return null;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = length > 12 || edge % 8 === 0 ? Math.max(1, Math.floor(length / 22)) : 0;
          return <g key={edge}>
            {Array.from({ length: steps }, (_, n) => {
              const t = (n + .5) / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
              return <g key={n}>
                <path d={`M${x - 3} ${y + 3}q-2 7 1 11m2-8 3 4`} fill="none" stroke="#604d30" strokeWidth="1" opacity=".6" />
                <ellipse cx={x + 4} cy={y + 14 + n % 3} rx={3 + n % 3} ry="2.5" fill={n % 2 ? "#b19b69" : "#6c7146"} />
                <ellipse cx={x} cy={y + 2} rx="7" ry="4" fill="var(--garden-grass)" />
              </g>;
            })}
          </g>;
        })}
        <polygon points={polygonPoints(bank)} fill={`url(#grass-${id})`} stroke="var(--garden-grass-edge)" strokeWidth="1.5" strokeLinejoin="round" />
        <g clipPath={`url(#bank-${id}-${i})`}>
          {layout.plots.filter(p => p.bank === i).map(p => <g key={p.plot}>
            <polygon points={polygonPoints(p.outline)} fill={p.plot % 3 ? "#effab0" : "#42783d"} opacity={p.plot % 3 ? ".08" : ".06"} />
            <path d={`m${p.x - 19} ${p.y + 3} 2-4 1 4 3-2m16-8 2-3 1 3m-9 17 1-3 2 3`} stroke="var(--garden-grass-edge)" strokeWidth="1" opacity=".45" fill="none" />
          </g>)}
        </g>
        {bank.map((a, edge) => {
          const b = bank[(edge + 1) % bank.length]!;
          if (Math.hypot(b.x - a.x, b.y - a.y) < 12 && edge % 8 !== 0) return null;
          return <g key={edge}>
            {(Math.hypot(b.x - a.x, b.y - a.y) > 50 ? [.19, .51, .81] : [.5]).map((t, n) => {
              const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
              return <g key={t} transform={`translate(${x} ${y - 2})`}>
                <path d="M0 1q-7-4-6-10Q0-6 0 1q1-12 6-15Q9-7 0 1q7-8 10-6L0 1" fill={n % 2 ? "#548549" : "#729d4c"} />
                {n === (i + edge) % 3 ? <><path d="M-3 0v-9m6 9v-6" stroke="#668844" /><circle cx="-3" cy="-10" r="2.3" fill="#f7e6a0" /><circle cx="3" cy="-7" r="2" fill="#f4efcf" /><circle cx="-3" cy="-10" r=".8" fill="#d6aa47" /></> : null}
              </g>;
            })}
          </g>;
        })}
      </g>;
    })}
    <g strokeLinejoin="round">
      <path data-garden-river d={layout.riverShape} fill={`url(#water-${id})`} stroke="#a6a77b" strokeWidth="4" />
      <g clipPath={`url(#channel-${id})`}>
        <path d={layout.riverShape} fill="none" stroke="#c1ddd0" strokeWidth="2" opacity=".55" />
        <path className="garden-stream-current" d={layout.riverShape} fill={`url(#ripples-${id})`} opacity=".55" />
        <path d={layout.riverPath} fill="none" stroke="#c7ede2" strokeWidth="1" strokeDasharray="12 24 5 30" strokeLinecap="round" opacity=".3" />
      </g>
    </g>
  </g>;
}

export function GardenBridge({ layout }: { layout: GardenLayout }) {
  const { x, y, angle, span } = layout.bridge;
  return <g aria-hidden="true" pointerEvents="none" transform={`translate(${x} ${y}) rotate(${angle}) scale(${span / 46} 1)`}>
    <rect x="-21" y="-5" width="42" height="18" rx="2" fill="#526d4c" opacity=".25" />
    <rect x="-23" y="-8" width="46" height="15" rx="2" fill="#806039" />
    <path d="M-23-9Q0-13 23-9V3Q0-1-23 3Z" fill="#cead74" stroke="#9d7a47" />
    {[-17, -10, -3, 4, 11, 18].map(p => <path key={p} d={`M${p} -9v11`} stroke="#9d794b" strokeWidth="1" />)}
    <path d="M-23-10Q0-14 23-10M-23 3Q0-1 23 3" fill="none" stroke="#f0d89c" strokeWidth="1.6" />
    {[-21, 21].map(p => <g key={p}><path d={`M${p} -8v-7m0 17v-7`} stroke="#795b37" strokeWidth="2.5" strokeLinecap="round" /><circle cx={p} cy="-15" r="1.7" fill="#e0c38b" /></g>)}
    <path d="M-21-15Q0-19 21-15" fill="none" stroke="#aa864f" strokeWidth="1.7" />
  </g>;
}
