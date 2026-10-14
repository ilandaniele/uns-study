type LayoutTableType = "MAIN_TABLE" | "WALL_BAR";

export interface LayoutTable {
  code: string;
  label: string;
  type: LayoutTableType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface LayoutSeat {
  tableCode: string;
  code: string;
  seatNumber: number;
  x: number;
  y: number;
  rotation: number;
}

export interface RoomLayout {
  viewBox: { width: number; height: number };
  tables: LayoutTable[];
  seats: LayoutSeat[];
}

export const ROOM_VIEWBOX = { width: 1000, height: 1600 } as const;

const MAIN_TABLE_WIDTH = 280;
const MAIN_TABLE_HEIGHT = 90;
const BAR_WIDTH = 40;
const BAR_HEIGHT = 220;

/**
 * Deterministic, pure generator for the initial 108-seat room geometry.
 *
 * Two columns of 6 main tables (M01..M06 left, M07..M12 right), bottom (entrance, y large)
 * to top (back/windows, y small). Four wall bars, 3 seats each: B03/B04 stand vertically against
 * the side walls near the back; B01/B02 run horizontally along the front wall, left / right of the
 * entrance door, with their seats on the room side. viewBox is `0 0 1000 1600` (back/windows at y=0, entrance at
 * the bottom / higher y).
 */
export function generateRoomLayout(): RoomLayout {
  const tables: LayoutTable[] = [];
  const seats: LayoutSeat[] = [];

  const leftX = 130;
  const rightX = ROOM_VIEWBOX.width - 130 - MAIN_TABLE_WIDTH; // central aisle between blocks

  // Six row slots per column, evenly spaced between the entrance (bottom) and the back wall (top).
  const rowCount = 6;
  const topMargin = 260; // leaves room for B03/B04 near the back wall
  const bottomMargin = 260; // leaves room for B01/B02 near the entrance
  const usableHeight = ROOM_VIEWBOX.height - topMargin - bottomMargin;
  const rowGap = usableHeight / (rowCount - 1);

  for (let row = 0; row < rowCount; row++) {
    // row 0 = M01/M07 near the entrance (bottom, largest y); row rowCount-1 = M06/M12 near the back.
    const y = ROOM_VIEWBOX.height - bottomMargin - row * rowGap - MAIN_TABLE_HEIGHT / 2;
    const tableIndex = row + 1; // 1..6

    for (const [column, x] of [["left", leftX] as const, ["right", rightX] as const]) {
      const number = column === "left" ? tableIndex : tableIndex + 6;
      const code = `M${String(number).padStart(2, "0")}`;
      tables.push({
        code,
        // Human-friendly display label ("Mesa 1".."Mesa 12") — `code` (M01..) stays the stable key
        // used for QR tokens and DB uniqueness.
        label: String(number),
        type: "MAIN_TABLE",
        x,
        y,
        width: MAIN_TABLE_WIDTH,
        height: MAIN_TABLE_HEIGHT,
        rotation: 0,
      });

      // Seats 1-4 along the top long side (left -> right), 5-8 along the bottom (right -> left).
      const seatGap = MAIN_TABLE_WIDTH / 5;
      for (let i = 0; i < 4; i++) {
        seats.push({
          tableCode: code,
          code: `${code}-S0${i + 1}`,
          seatNumber: i + 1,
          x: x + seatGap * (i + 1),
          y: y - 30,
          rotation: 0,
        });
      }
      for (let i = 0; i < 4; i++) {
        const seatNumber = i + 5;
        seats.push({
          tableCode: code,
          code: `${code}-S0${seatNumber}`,
          seatNumber,
          x: x + seatGap * (4 - i),
          y: y + MAIN_TABLE_HEIGHT + 30,
          rotation: 0,
        });
      }
    }
  }

  // Wall bars. B03 left/back and B04 right/back are vertical, hugging the side walls near the
  // windows. B01 left/entrance and B02 right/entrance are horizontal along the front (bottom) wall,
  // one on each side of the door, running from near the corner almost to the door; their 3 seats
  // sit along the bar on the room side (above it).
  const doorHalfGap = 110; // clear space each side of the room centre for the entrance door (door is 180 wide)
  const sideMargin = 40;
  const frontBarHeight = 40;
  const frontBarY = ROOM_VIEWBOX.height - 40 - frontBarHeight;
  const frontBarWidth = ROOM_VIEWBOX.width / 2 - doorHalfGap - sideMargin;
  const barDefs: Array<{ code: string; side: "left" | "right"; near: "entrance" | "back" }> = [
    { code: "B01", side: "left", near: "entrance" },
    { code: "B02", side: "right", near: "entrance" },
    { code: "B03", side: "left", near: "back" },
    { code: "B04", side: "right", near: "back" },
  ];

  for (const bar of barDefs) {
    const isFront = bar.near === "entrance";
    const width = isFront ? frontBarWidth : BAR_WIDTH;
    const height = isFront ? frontBarHeight : BAR_HEIGHT;
    const x =
      bar.side === "left"
        ? sideMargin
        : ROOM_VIEWBOX.width - sideMargin - width;
    const y = isFront ? frontBarY : 60;
    tables.push({
      code: bar.code,
      label: bar.code,
      type: "WALL_BAR",
      x,
      y,
      width,
      height,
      rotation: 0,
    });

    const seatGap = (isFront ? width : height) / 4;
    for (let i = 0; i < 3; i++) {
      seats.push({
        tableCode: bar.code,
        code: `${bar.code}-S0${i + 1}`,
        seatNumber: i + 1,
        x: isFront ? x + seatGap * (i + 1) : x + width / 2,
        y: isFront ? y - 30 : y + seatGap * (i + 1),
        rotation: 0,
      });
    }
  }

  return { viewBox: ROOM_VIEWBOX, tables, seats };
}
