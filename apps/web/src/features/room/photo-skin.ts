import type { RoomMapDto } from "@sala/contracts";

/**
 * Photographic backdrop for a room: a day photo and a night photo, selected by local time, of
 * the real room seen from above, plus where each seat and table label sits in that photo. The
 * canonical layout (`packages/database/src/layout.ts`) is untouched; this is display-only, so the
 * map draws seat markers over the chairs in the photo instead of at the layout coordinates.
 */
export interface PhotoSkin {
  viewBox: { width: number; height: number };
  dayHref: string;
  nightHref: string;
  /** Seat code (e.g. "M06-S01") to its marker centre, in photo pixels. */
  seats: ReadonlyMap<string, { x: number; y: number }>;
  /** Main-table code to its tabletop rectangle; the "Mesa N" label is painted at its centre. */
  tables: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>;
}

// Measured on the 1090x1536 photos (the strip right of x=994 was rebuilt so the right wall shows).
// Rows go from the back wall (Mesa 6 / 12) to the entrance
// (Mesa 1 / 7): top edge of the tabletop, bottom edge, and the x of the four chairs on each side.
const MAIN_ROWS: Array<{ left: number; right: number; top: number; bottom: number; leftXs: number[]; rightXs: number[] }> = [
  { left: 6, right: 12, top: 195, bottom: 282, leftXs: [217, 288, 359, 430], rightXs: [663, 736, 808, 882] },
  { left: 5, right: 11, top: 387, bottom: 478, leftXs: [213, 285, 358, 430], rightXs: [663, 737, 809, 884] },
  { left: 4, right: 10, top: 585, bottom: 678, leftXs: [210, 283, 357, 429], rightXs: [663, 737, 810, 886] },
  { left: 3, right: 9, top: 790, bottom: 885, leftXs: [209, 283, 357, 430], rightXs: [663, 737, 811, 887] },
  { left: 2, right: 8, top: 995, bottom: 1093, leftXs: [209, 283, 356, 429], rightXs: [663, 738, 812, 889] },
  { left: 1, right: 7, top: 1200, bottom: 1297, leftXs: [209, 283, 357, 430], rightXs: [663, 739, 813, 891] },
];
const LEFT_TABLE = { x: 150, width: 337 };
const RIGHT_TABLE = { x: 605, width: 340 };
/** Top-row markers sit on the chair backs; bottom-row markers on the cushions below the table edge. */
const TOP_CHAIR_OFFSET = -12;
const BOTTOM_CHAIR_OFFSET = 22;

// Wall-bar stools, seats 1..3 in layout order.
const BAR_SEATS: Record<string, Array<{ x: number; y: number }>> = {
  B01: [{ x: 138, y: 1379 }, { x: 229, y: 1379 }, { x: 322, y: 1379 }],
  B02: [{ x: 767, y: 1379 }, { x: 858, y: 1379 }, { x: 949, y: 1379 }],
  B03: [{ x: 108, y: 116 }, { x: 106, y: 176 }, { x: 104, y: 237 }],
  B04: [{ x: 988, y: 120 }, { x: 988, y: 180 }, { x: 990, y: 238 }],
};

function tableCode(n: number): string {
  return `M${String(n).padStart(2, "0")}`;
}

function buildPrincipal(): PhotoSkin {
  const seats = new Map<string, { x: number; y: number }>();
  const tables = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const row of MAIN_ROWS) {
    for (const [n, xs, span] of [[row.left, row.leftXs, LEFT_TABLE], [row.right, row.rightXs, RIGHT_TABLE]] as const) {
      const code = tableCode(n);
      // Seats 1-4 along the back-facing side, left to right; 5-8 along the entrance side, right to left.
      xs.forEach((x, i) => seats.set(`${code}-S0${i + 1}`, { x, y: row.top + TOP_CHAIR_OFFSET }));
      xs.forEach((x, i) => seats.set(`${code}-S0${8 - i}`, { x, y: row.bottom + BOTTOM_CHAIR_OFFSET }));
      tables.set(code, { x: span.x, y: row.top, width: span.width, height: row.bottom - row.top });
    }
  }
  for (const [code, list] of Object.entries(BAR_SEATS)) {
    list.forEach((pos, i) => seats.set(`${code}-S0${i + 1}`, pos));
  }
  return {
    viewBox: { width: 1090, height: 1536 },
    dayHref: "/room/principal-dia.webp",
    nightHref: "/room/principal-noche.webp",
    seats,
    tables,
  };
}

const SKINS: Record<string, PhotoSkin> = { principal: buildPrincipal() };

/**
 * The photo skin for this room, or null when there is none or the live layout has a seat the photo
 * does not know (a layout change must never leave a seat without a marker).
 */
export function photoSkinFor(map: Pick<RoomMapDto, "room" | "seats">): PhotoSkin | null {
  const skin = SKINS[map.room.slug];
  if (!skin) return null;
  return map.seats.every((seat) => skin.seats.has(seat.code)) ? skin : null;
}
