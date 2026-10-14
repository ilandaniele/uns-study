import type { VerifySeat } from "./schema.js";

/** Deterministic text description of the room, given to the model next to the floor-plan image. */
export function describeLayout(seats: VerifySeat[]): string {
  const byTable = new Map<string, VerifySeat[]>();
  for (const seat of seats) {
    const list = byTable.get(seat.tableCode) ?? [];
    list.push(seat);
    byTable.set(seat.tableCode, list);
  }
  const lines = [
    "Room coordinate system: SVG viewBox 1000 wide by 1600 tall. x grows to the right, y grows downward.",
    "Windows run along the top wall (y = 0, the back of the room).",
    "The entrance door is at the bottom wall (y = 1600, centred), with a wall bar on the entrance wall on each side of the door.",
    "Seats by table (code @ x,y):",
  ];
  for (const tableCode of [...byTable.keys()].sort()) {
    const tableSeats = [...byTable.get(tableCode)!].sort((a, b) => a.code.localeCompare(b.code));
    const cells = tableSeats.map((s) => `${s.code} @ ${Math.round(s.x)},${Math.round(s.y)}`);
    lines.push(`${tableCode}: ${cells.join("; ")}`);
  }
  return lines.join("\n");
}
