import { GARDEN_SIZE } from "@sala/contracts";

/** The same 25 plot identities on two banks; only the decorative projection changes. */
export function gardenPlotPosition(plot: number) {
  const row = Math.floor(plot / 5), col = plot % 5;
  const bank = col < 2 ? -1 : 1;
  return { x: 300 + (col - row) * 48 + bank * 12, y: 105 + (col + row) * 25 + bank * 6, row, col };
}

export const GARDEN_PLOT_ORDER = Array.from({ length: GARDEN_SIZE }, (_, plot) => ({ plot, ...gardenPlotPosition(plot) }))
  .sort((a, b) => a.row + a.col - b.row - b.col || a.row - b.row);
