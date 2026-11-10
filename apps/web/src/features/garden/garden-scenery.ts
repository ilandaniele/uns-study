import type { GardenLayout, GardenPoint } from "./garden-layout";

export interface GardenScenery { x:number; y:number; size:number; frame:number; bank:number }
export function sceneryFootprint(detail: Pick<GardenScenery,"x"|"y"|"size">) {
  return { x:detail.x, y:detail.y-detail.size*.08, rx:detail.size*.48+1, ry:detail.size*.19+1 };
}
function contains(bank:readonly GardenPoint[], point:GardenPoint) {
  let inside=false;
  for(let i=0,j=bank.length-1;i<bank.length;j=i++) {
    const a=bank[i]!,b=bank[j]!;
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
/** The entire ground-contact ellipse must fit: checking only the sprite anchor is insufficient. */
export function sceneryFitsBank(bank:readonly GardenPoint[], detail:Pick<GardenScenery,"x"|"y"|"size">) {
  const e=sceneryFootprint(detail);
  if(!contains(bank,e))return false;
  for(let i=0;i<bank.length;i++) {
    const a=bank[i]!,b=bank[(i+1)%bank.length]!;
    const ax=(a.x-e.x)/e.rx,ay=(a.y-e.y)/e.ry,bx=(b.x-e.x)/e.rx,by=(b.y-e.y)/e.ry;
    const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)) : 0;
    if((ax+t*dx)**2+(ay+t*dy)**2<1)return false;
  }
  return true;
}
export function createGardenScenery(layout:GardenLayout,frames:readonly number[]):GardenScenery[] {
  const result:GardenScenery[]=[];
  const shores=[layout.channel.slice(0,121),layout.channel.slice(121).reverse()];
  layout.banks.forEach((bank,side)=>{
    const candidates=[...[.18,.48,.78].map(t=>bank[Math.floor(t*bank.length)]!),...[.2,.5,.8].map(t=>shores[side]![Math.round(t*120)]!)];
    candidates.forEach((point,index)=>{
      const centres=layout.plots.filter(p=>p.bank===side).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)).slice(0,3);
      for(const size of [index%2 ? 28 : 34,24])for(const target of centres)for(let step=0;step<=12;step++){
        const t=step/12,detail={x:point.x+(target.x-point.x)*t,y:point.y+(target.y-point.y)*t,size,bank:side,frame:frames[(index+side)%frames.length]!};
        if(!sceneryFitsBank(bank,detail))continue;
        if(result.every(other=>Math.hypot(other.x-detail.x,other.y-detail.y)>17))result.push(detail);
        return;
      }
    });
  });
  return result.sort((a,b)=>a.y-b.y);
}
