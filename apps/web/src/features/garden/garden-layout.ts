import { GARDEN_SIZE, GARDEN_MAX_SIZE } from "@sala/contracts";

export interface GardenPoint { x: number; y: number }
const round = (n: number) => Math.round(n * 100) / 100;
export const polygonPoints = (points: GardenPoint[]) => points.map(p => `${round(p.x)},${round(p.y)}`).join(" ");

/** Plot numbers are permanent; the whole landscape follows the same curved banks. */
export function createGardenLayout(plotCount = GARDEN_SIZE, seed = 1) {
  const count = Number.isInteger(plotCount) && plotCount >= GARDEN_SIZE && plotCount <= GARDEN_MAX_SIZE && plotCount % 5 === 0 ? plotCount : GARDEN_SIZE;
  const rows = count / 5;
  const stableSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 65536 : 1;
  const variant = stableSeed % 8;
  const acrossRows = variant % 2 === 1;
  const dx = Math.min(44, 410 / (rows + 4)), dy = dx * .52;
  const origin = { x: 300 + (rows - 5) * dx / 2, y: 120 };
  const alongCount = acrossRows ? 5 : rows;
  const acrossCount = acrossRows ? rows : 5;
  const cut = acrossRows ? Math.floor(rows / 2) - .5 : .5 + Math.floor(variant / 2);
  // Some accounts receive a straight stream; others receive different meanders and orientations.
  const amplitude = [.52, .7, 0, .62, .45, 0, .76, .56][variant]!;
  const phase = (stableSeed % 7) * .37;
  // Smooth, asymmetric meanders; both banks and plot corners share this mapping.
  const bend = (v: number) => {
    const t = (v + .5) / alongCount;
    return amplitude * Math.sin(t * Math.PI * 2 + phase)
      + (amplitude ? .13 : 0) * Math.sin(t * Math.PI * 4 + phase + .8);
  };
  const project = (u: number, v: number, side: number): GardenPoint => {
    // Taper the meanders into the terrain: the outer island stays straight,
    // while the riverbank and its neighbouring plots follow the water.
    const influence = u <= cut ? (u + .5) / (cut + .5) : (acrossCount - .5 - u) / (acrossCount - .5 - cut);
    const t = (v + .5) / alongCount;
    const width = .23 + .045 * Math.sin(t * Math.PI * 2 + phase) + .018 * Math.sin(t * Math.PI * 5 + phase);
    const across = u + bend(v) * influence + side * width;
    // The ground boundary has small natural lobes; numbered plot centres stay fixed.
    const lowU = Math.max(0, 1 - Math.abs(u + .5) * 2), highU = Math.max(0, 1 - Math.abs(u - acrossCount + .5) * 2);
    const lowV = Math.max(0, 1 - Math.abs(v + .5) * 2), highV = Math.max(0, 1 - Math.abs(v - alongCount + .5) * 2);
    const organicU = across + (highU - lowU) * (.1 + .07 * Math.sin(v * 4.8 + phase) + .025 * Math.sin(v * 11.4));
    const organicV = v + (highV - lowV) * (.1 + .07 * Math.sin(u * 4.1 + phase) + .025 * Math.sin(u * 10.7));
    const col = acrossRows ? organicV : organicU, row = acrossRows ? organicU : organicV;
    return { x: round(origin.x + (col - row) * dx), y: round(origin.y + (col + row) * dy) };
  };
  const plots = Array.from({ length: count }, (_, plot) => {
    const row = Math.floor(plot / 5), col = plot % 5;
    const u = acrossRows ? row : col, v = acrossRows ? col : row;
    const bank = u < cut ? 0 : 1, side = bank ? 1 : -1;
    const edge = (across: number, reverse: boolean) => Array.from({ length: 13 }, (_, i) => project(across, v - .5 + (reverse ? 1 - i / 12 : i / 12), side));
    const outline = [...edge(u - .5, false), ...edge(u + .5, true)];
    return { plot, row, col, bank, ...project(u, v, side), outline, halfWidth: dx, halfHeight: dy };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
  const banks = [0, 1].map(bank => {
    const side = bank ? 1 : -1, low = bank ? cut : -.5, high = bank ? acrossCount - .5 : cut;
    const edge = (u: number, reverse: boolean) => Array.from({ length: alongCount * 12 + 1 }, (_, i) => project(u, -.5 + (reverse ? 1 - i / (alongCount * 12) : i / (alongCount * 12)) * alongCount, side));
    // Follow the concave shoreline instead of filling its convex hull.
    const endSamples = Math.ceil((high-low)*12);
    const end = (v: number, reverse: boolean) => Array.from({length:endSamples+1},(_,i)=>project(low+(high-low)*(reverse ? 1-i/endSamples : i/endSamples),v,side));
    const points = [...edge(low, false), ...end(alongCount-.5,false).slice(1), ...edge(high, true).slice(1), ...end(-.5,true).slice(1,-1)];
    const area = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]!; return sum + p.x * next.y - next.x * p.y; }, 0);
    return area > 0 ? points : points.reverse();
  });
  const at = (t: number) => project(cut, -.5 + alongCount * t, 0);
  const river = Array.from({ length: 121 }, (_, i) => at(i / 120));
  const shoreline = (side: number) => Array.from({ length: 121 }, (_, i) => project(cut, -.5 + alongCount * i / 120, side));
  const channel = [...shoreline(-1), ...shoreline(1).reverse()];
  return { count, plots, banks, variant, river, channel,
    riverPath: river.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "),
    riverShape: `M${polygonPoints(channel).replaceAll(" ", " L")}Z`,
  };
}
export const gardenPlotPosition = (plot: number) => createGardenLayout().plots.find(p => p.plot === plot)!;
export const GARDEN_PLOT_ORDER = createGardenLayout().plots;
export type GardenLayout = ReturnType<typeof createGardenLayout>;
