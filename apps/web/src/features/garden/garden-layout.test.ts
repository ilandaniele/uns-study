import {describe,expect,it} from "vitest";
import {createGardenLayout, type GardenPoint} from "./garden-layout";
function contains(polygon: GardenPoint[], point: GardenPoint) {
 let inside = false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i]!,b=polygon[j]!;
  if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
 }
 return inside;
}
describe("personal garden projection",()=>{
 it("preserves all plot identities and stays inside the drawing at every expansion and river variant",()=>{
  for(const count of [25,30,35,40,45,50])for(let seed=1;seed<=32;seed++){
   const layout=createGardenLayout(count,seed);
   expect(layout.plots.map(p=>p.plot).sort((a,b)=>a-b)).toEqual(Array.from({length:count},(_,i)=>i));
   expect(layout.banks.every(b=>b.length>=3)).toBe(true);
   for(const p of layout.plots){expect(p.x-p.halfWidth).toBeGreaterThanOrEqual(0);expect(p.x+p.halfWidth).toBeLessThanOrEqual(600);expect(p.y-p.halfWidth*2).toBeGreaterThanOrEqual(0);expect(p.y+p.halfHeight+32).toBeLessThan(430);}
  }
 });
 it("is stable for owner and visitor, with opposite and distinct meandering rivers",()=>{const paths=Array.from({length:6},(_,i)=>createGardenLayout(25,i+1).riverPath);expect(new Set(paths).size).toBe(6);expect(createGardenLayout(35,7)).toEqual(createGardenLayout(35,7));expect(createGardenLayout(35,7).riverPath).not.toBe(createGardenLayout(35,8).riverPath);});
 it("keeps every plant on its own selectable bank, outside the water, at every expansion",()=>{
  for(const count of [25,30,35,40,45,50])for(let seed=1;seed<=32;seed++){
   const layout=createGardenLayout(count,seed);
   for(const p of layout.plots){
    expect(contains(layout.banks[p.bank]!,p)).toBe(true);
    expect(contains(p.outline,p)).toBe(true);
    expect(contains(layout.channel,p)).toBe(false);
   }
   for(const p of [...layout.channel,...layout.banks.flat()]){
    expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(600);
    expect(p.y).toBeGreaterThan(0);expect(p.y+16).toBeLessThan(430);
   }
  }
 });
 it("gives all river variants substantial bends instead of a straight canal",()=>{
  for(const count of [25,50])for(let seed=0;seed<32;seed++){
   const {river}=createGardenLayout(count,seed),a=river[0]!,b=river.at(-1)!;
   const deviation=Math.max(...river.map(p=>Math.abs((b.x-a.x)*(a.y-p.y)-(a.x-p.x)*(b.y-a.y))/Math.hypot(b.x-a.x,b.y-a.y)));
   expect(deviation).toBeGreaterThan(10);
  }
 });
 it("does not render fabricated capacity",()=>{expect(createGardenLayout(1000).count).toBe(25);expect(createGardenLayout(26).count).toBe(25);});
});
