import {describe,expect,it} from "vitest";
import {createGardenLayout,type GardenPoint} from "./garden-layout";
import {createGardenScenery,sceneryFitsBank,sceneryFootprint} from "./garden-scenery";

function inside(polygon:readonly GardenPoint[],point:GardenPoint) {
  let crossings=0;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!;
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)crossings++;
  }
  return crossings%2===1;
}
describe("grounded garden scenery",()=>{
  it.each([25,30,35,40,45,50])("keeps complete rock footprints inside their banks across all river variants with %i plots",count=>{
    for(let seed=0;seed<32;seed++){
      const layout=createGardenLayout(count,seed),details=createGardenScenery(layout,[0,2,3,5]);
      expect(details.length).toBeGreaterThanOrEqual(6);
      for(const detail of details){
        const e=sceneryFootprint(detail);
        for(let n=0;n<24;n++)expect(inside(layout.banks[detail.bank]!,{x:e.x+e.rx*Math.cos(n*Math.PI/12),y:e.y+e.ry*Math.sin(n*Math.PI/12)})).toBe(true);
      }
      expect(createGardenScenery(layout,[0,2,3,5])).toEqual(details);
    }
  });
  it("rejects rocks anchored on the boundary, including the reported corner overflow",()=>{
    const layout=createGardenLayout(25,1);
    for(const bank of layout.banks)expect(sceneryFitsBank(bank,{...bank[0]!,size:34})).toBe(false);
  });
});
