/** Deterministic silhouettes and fine foliage, shared by every tree preview. */
type Cluster = readonly [number, number, number, number];
interface Form {
  clusters: readonly Cluster[];
  trunk?: string;
  leaf: number;
  flower?: "pompom" | "flame" | "bell" | "star" | "berry";
  blooms?: number;
  sparse?: boolean;
  needles?: boolean;
  trailing?: boolean;
}
const FORK = "M42 100Q46 87 43 72L45 53 49 47 50 70Q49 86 55 100L48 98Z";
const FORMS: Record<string, Form> = {
  espinillo: { clusters: [[23,47,14,13],[35,29,16,15],[55,24,16,14],[72,39,15,16],[53,48,23,17]], leaf: 1.3, flower: "pompom", blooms: 36 },
  tala: { clusters: [[22,50,13,16],[31,32,17,17],[52,22,18,17],[73,38,14,18],[54,48,23,19]], trunk: "M40 100 45 84 41 66 46 47 51 40 49 64 51 83 56 100 48 97Z", leaf: 2.3 },
  ceibo: { clusters: [[22,47,17,15],[34,28,17,15],[59,22,17,13],[74,40,16,18],[51,46,21,18]], trunk: "M37 100Q45 85 40 70L45 49 50 43 49 68Q49 85 58 100L47 97Z", leaf: 3.1, flower: "flame", blooms: 24 },
  chanar: { clusters: [[24,45,16,13],[39,26,16,14],[61,26,16,13],[74,44,14,14],[46,46,22,16]], trunk: "M40 100 45 78 41 63 46 40 50 39 48 62 50 79 55 100Z", leaf: 1.9, flower: "star", blooms: 28 },
  algarrobo: { clusters: [[18,43,13,12],[32,29,18,14],[55,24,20,14],[77,36,15,13],[62,46,22,13],[35,48,19,12]], leaf: 1.1 },
  jacaranda: { clusters: [[17,42,12,11],[32,28,18,13],[55,21,19,13],[77,34,14,12],[64,45,21,13],[35,46,21,13]], trunk: "M42 100Q48 79 44 64L47 41 51 38 50 63 51 82 56 100Z", leaf: 1.1, flower: "bell", blooms: 72 },
  aguaribay: { clusters: [[25,33,15,14],[45,22,19,14],[65,30,18,15],[77,48,12,22],[57,51,17,25],[34,52,15,24],[17,53,10,20]], leaf: 1.6, flower: "berry", blooms: 32, trailing: true },
  "palo-borracho": { clusters: [[22,44,15,14],[34,27,18,14],[58,24,18,15],[75,41,15,16],[50,45,23,16]], trunk: "M36 100Q44 89 39 76Q34 65 42 52L46 38H51L55 53Q65 69 57 81L60 100Z", leaf: 2, flower: "star", blooms: 25 },
  calden: { clusters: [[15,43,11,10],[29,30,16,12],[48,27,17,12],[69,28,17,13],[81,42,11,11],[55,45,24,12],[29,46,17,11]], trunk: "M39 100 45 82 40 66 44 51 50 44 48 65 51 82 57 100 47 96Z", leaf: 1.2, sparse: true },
  lapacho: { clusters: [[22,45,15,15],[34,27,17,16],[56,21,18,15],[74,37,16,17],[55,49,22,15]], leaf: 1.5, flower: "bell", blooms: 90, sparse: true },
  arrayan: { clusters: [[29,50,16,18],[30,32,14,17],[48,19,15,16],[65,31,15,18],[66,51,17,18],[47,43,19,23]], trunk: "M39 100 45 79 42 61 46 37 49 34 49 60 50 78 57 100 48 97Z", leaf: 2.1, flower: "star", blooms: 16 },
  pehuen: { clusters: [[16,40,10,6],[30,23,13,7],[50,16,15,7],[73,25,13,7],[82,43,9,6],[57,36,14,8],[36,40,12,7]], trunk: "M43 100 45 69 44 44 46 19H50L50 43 52 70 55 100Z", leaf: 2.2, needles: true, sparse: true },
};

const n = (v: number) => Math.round(v * 10) / 10;
function random(seed: number) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
function leaf(x: number, y: number, size: number, angle: number, narrow: boolean) {
  const dx = Math.cos(angle)*size, dy = Math.sin(angle)*size, across = narrow ? .25 : .56;
  return `M${n(x-dx)} ${n(y-dy)}Q${n(x-dy*across)} ${n(y+dx*across)} ${n(x+dx)} ${n(y+dy)}Q${n(x+dy*across)} ${n(y-dx*across)} ${n(x-dx)} ${n(y-dy)}Z`;
}
function blossom(x: number, y: number, size: number, kind: Form["flower"], rng: () => number) {
  if (kind === "berry") return `M${n(x-size)} ${n(y)}a${n(size)} ${n(size)} 0 1 0 ${n(size*2)} 0a${n(size)} ${n(size)} 0 1 0 ${n(-size*2)} 0`;
  if (kind === "flame") return `M${n(x)} ${n(y+size)}q${n(-size*2)} ${n(-size)} ${n(size*.4)} ${n(-size*3)}q${n(size*1.5)} ${n(size*.4)} ${n(size*.4)} ${n(size*2)}Z`;
  if (kind === "bell") return `M${n(x)} ${n(y+size*1.6)}l${n(-size*.4)} ${n(-size)}q${n(-size*1.8)} ${n(-size*.3)} ${n(-size)} ${n(-size*1.4)}q${n(size*.8)} ${n(-size*.9)} ${n(size*1.7)} 0q${n(size*.9)} ${n(size)} ${n(-size*.3)} ${n(size*1.3)}Z`;
  let path = "";
  const points = kind === "pompom" ? 20 : 10;
  for (let j = 0; j < points; j++) {
    const angle = j*Math.PI*2/points, r = size*(j%2 ? .4+rng()*.15 : 1);
    path += `${j ? "L" : "M"}${n(x+Math.cos(angle)*r)} ${n(y+Math.sin(angle)*r)}`;
  }
  return path + "Z";
}
export interface TreeGeometry {
  trunk: string;
  branches: string[];
  crown: string[];
  leaves: string[];
  blossoms: string[];
  barkMarks: string;
  trailing: string;
}
function build(id: string, variant: number): TreeGeometry {
  const form = FORMS[id] ?? FORMS.tala;
  const rng = random([...id].reduce((sum,c) => (Math.imul(sum,31)+c.charCodeAt(0))>>>0,17)+variant*197);
  const leaves = ["","","",""], blossoms = ["","",""];
  const branches: string[] = [];
  const crown: string[] = [];
  let trailing = "";
  const clusters = form.clusters.map(([x,y,rx,ry]) => [x+(rng()-.5)*3,y+(rng()-.5)*3,rx,ry] as const);
  for (const [x,y,rx,ry] of clusters) {
    const fork = form.needles ? 40 : 72;
    branches.push(`M48 ${fork}Q${n(44+(x-48)*.14)} ${form.needles ? 43 : 53} ${n(x)} ${n(y+4)}M${n((x+48)/2)} ${n((y+fork)/2)}Q${n(x-8)} ${n(y+8)} ${n(x-rx*.6)} ${n(y-ry*.1)}`);
    let canopy = "";
    for (let j = 0; j < 20; j++) {
      const angle = j*Math.PI/10, r = .78+rng()*.22;
      canopy += `${j ? "L" : "M"}${n(x+Math.cos(angle)*rx*r)} ${n(y+Math.sin(angle)*ry*r)}`;
    }
    crown.push(canopy+"Z");
    for (let j = 0; j < (form.needles ? 55 : form.sparse ? 27 : 44); j++) {
      const angle = rng()*Math.PI*2, r = Math.sqrt(rng());
      const lx = x+Math.cos(angle)*rx*r, ly = y+Math.sin(angle)*ry*r;
      const light = Math.min(3,Math.floor(rng()*3+(ly<y ? .8 : 0)));
      leaves[light] += leaf(lx,ly,form.leaf*(.8+rng()*.7),form.trailing ? Math.PI/2+(rng()-.5)*.5 : rng()*Math.PI,!!form.needles || form.leaf<1.7);
    }
    if (form.trailing) for (let j = 0; j < 4; j++) {
      const tx = x+(rng()-.5)*rx;
      trailing += `M${n(tx)} ${n(y)}q${n((rng()-.5)*10)} 10 ${n((rng()-.5)*7)} ${n(ry+8)}`;
    }
  }
  for (let j = 0; j < (form.blooms ?? 0); j++) {
    const [x,y,rx,ry] = clusters[Math.floor(rng()*clusters.length)];
    const angle = rng()*Math.PI*2, r = Math.sqrt(rng())*.93;
    const size = form.flower === "berry" ? .8 : form.flower === "bell" ? 1.7 : form.flower === "flame" ? 1.6 : id === "arrayan" ? 1.1 : id === "palo-borracho" ? 2.9 : 1.8;
    blossoms[j%3] += blossom(x+Math.cos(angle)*rx*r,y+Math.sin(angle)*ry*r,size*(.8+rng()*.45),form.flower,rng);
  }
  let barkMarks = "";
  for (let j = 0; j < 12; j++) {
    const x = 45+rng()*6, y = 66+rng()*31;
    barkMarks += `M${n(x)} ${n(y)}l${n((rng()-.5)*2)} ${n(2+rng()*5)}`;
  }
  return { trunk: form.trunk ?? FORK, branches, crown, leaves, blossoms, barkMarks, trailing };
}
// Three bounded variants per species; no per-render randomness or hydration mismatch.
const ART = Object.fromEntries(Object.keys(FORMS).map(id => [id,[0,1,2].map(variant => build(id,variant))]));
export function treeGeometry(id: string, variant = 0): TreeGeometry {
  const variations = ART[id] ?? ART.tala;
  return variations[((Math.trunc(variant)%3)+3)%3] ?? variations[0];
}
export function treeColor(hex: string, target: string, amount: number) {
  const a = Number.parseInt(hex.slice(1),16), b = Number.parseInt(target.slice(1),16);
  return `rgb(${[16,8,0].map(shift => Math.round(((a>>shift)&255)*(1-amount)+((b>>shift)&255)*amount)).join(" ")})`;
}
