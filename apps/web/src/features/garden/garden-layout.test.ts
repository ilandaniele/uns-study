import {describe,expect,it} from "vitest";
import {createGardenLayout} from "./garden-layout";
describe("personal garden projection",()=>{
 it("preserves all plot identities and stays inside the drawing at every expansion and river variant",()=>{
  for(const count of [25,30,35,40,45,50])for(let seed=1;seed<=32;seed++){
   const layout=createGardenLayout(count,seed);
   expect(layout.plots.map(p=>p.plot).sort((a,b)=>a-b)).toEqual(Array.from({length:count},(_,i)=>i));
   expect(layout.banks.every(b=>b.length>=3)).toBe(true);
   for(const p of layout.plots){expect(p.x-p.halfWidth).toBeGreaterThanOrEqual(0);expect(p.x+p.halfWidth).toBeLessThanOrEqual(600);expect(p.y-p.halfWidth*1.81).toBeGreaterThanOrEqual(0);expect(p.y+p.halfHeight+32).toBeLessThan(430);}
  }
 });
 it("is stable for owner and visitor, with diagonal, opposite, straight and meandering rivers",()=>{const paths=Array.from({length:6},(_,i)=>createGardenLayout(25,i+1).riverPath);expect(new Set(paths).size).toBe(6);expect(createGardenLayout(35,7)).toEqual(createGardenLayout(35,7));expect(createGardenLayout(35,7).riverPath).not.toBe(createGardenLayout(35,8).riverPath);});
 it("does not render fabricated capacity",()=>{expect(createGardenLayout(1000).count).toBe(25);expect(createGardenLayout(26).count).toBe(25);});
});
