import { GARDEN_SIZE, GARDEN_MAX_SIZE } from "@sala/contracts";
export interface GardenPoint { x: number; y: number }
const round = (n: number) => Math.round(n * 100) / 100;
export const polygonPoints = (points: GardenPoint[]) => points.map(p => `${round(p.x)},${round(p.y)}`).join(" ");
function hull(points: GardenPoint[]) {
  const sorted = [...points].sort((a,b) => a.x-b.x || a.y-b.y);
  const cross = (a: GardenPoint,b: GardenPoint,c: GardenPoint) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half = (items: GardenPoint[]) => { const result: GardenPoint[]=[]; for(const p of items) { while(result.length>1 && cross(result[result.length-2]!,result.at(-1)!,p)<=0) result.pop(); result.push(p); } return result; };
  return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
/** Plot numbers are permanent. Only the projection and decorative banks vary. */
export function createGardenLayout(plotCount = GARDEN_SIZE, seed = 1) {
  const count = Number.isInteger(plotCount) && plotCount >= GARDEN_SIZE && plotCount <= GARDEN_MAX_SIZE && plotCount % 5 === 0 ? plotCount : GARDEN_SIZE;
  const rows = count / 5;
  const variant = Math.abs(Math.floor(seed)) % 6;
  const dx = Math.min(46, 440 / (rows + 4)), dy = dx * .52;
  const origin = { x: 300 + (rows-5)*dx/2, y: 112 };
  const project = (col: number,row: number): GardenPoint => ({ x: round(origin.x+(col-row)*dx), y: round(origin.y+(col+row)*dy) });
  const horizontal = variant === 2;
  const acrossRows = variant === 1 || variant === 4;
  const colCut = variant === 5 ? (Math.floor(seed/6)%2 ? 3.5 : .5) : 1.5;
  const rowCut = Math.floor(rows/2)-.5;
  const diagonalCut = Math.floor((rows+3)/2)+.5;
  const plots = Array.from({length: count},(_,plot) => {
    const row=Math.floor(plot/5), col=plot%5;
    const side = horizontal ? row+col < diagonalCut : acrossRows ? row < rowCut : col < colCut;
    const direction=side ? -1 : 1;
    const p = horizontal ? project(col,row) : acrossRows ? project(col,row+direction*.43) : project(col+direction*.43,row);
    return {plot,row,col,bank:side ? 0 : 1,x:p.x,y:round(p.y+(horizontal ? direction*23 : 0)),halfWidth:dx,halfHeight:dy};
  }).sort((a,b) => a.y-b.y || a.x-b.x);
  const banks = [0,1].map(bank => hull(plots.filter(p => p.bank===bank).flatMap(p => [
    {x:p.x,y:p.y-dy},{x:p.x+dx,y:p.y},{x:p.x,y:p.y+dy},{x:p.x-dx,y:p.y},
  ])));
  const at = (t: number) => {
    if(horizontal) { const low=Math.max(-.65,diagonalCut-(rows-.35)),high=Math.min(4.65,diagonalCut+.65); return project(low+(high-low)*t,diagonalCut-low-(high-low)*t); }
    const p=acrossRows ? project(-.65+5.3*t,rowCut) : project(colCut,-.65+(rows+.3)*t);
    const wave=variant===3 || variant===4 ? Math.sin(t*Math.PI*2)*4 : 0;
    return {x:round(p.x+wave),y:round(p.y+wave*.5)};
  };
  const river = Array.from({length:25},(_,i) => at(i/24));
  const bridgeAt = .35+(seed%3)*.14;
  const bridge = at(bridgeAt), tangent=at(bridgeAt+.02);
  return {count,plots,banks,variant,riverPath:river.map((p,i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "),
    bridge:{...bridge,angle:Math.atan2(tangent.y-bridge.y,tangent.x-bridge.x)*180/Math.PI+90},
  };
}
export const gardenPlotPosition = (plot: number) => createGardenLayout().plots.find(p=>p.plot===plot)!;
export const GARDEN_PLOT_ORDER = createGardenLayout().plots;
export type GardenLayout = ReturnType<typeof createGardenLayout>;
