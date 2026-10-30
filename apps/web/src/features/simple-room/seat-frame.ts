import type { SeatCalibrationInput, SeatDto } from "@sala/contracts";

const METERS_PER_DEGREE = 6_371_000 * Math.PI / 180;
type SeatPoint = Pick<SeatDto, "id" | "x" | "y">;
export interface SeatFrameInput {
  latitude: number;
  longitude: number;
  widthM: number;
  lengthM: number;
  /** Bearing of the TOP of the drawing, clockwise from geographic north. */
  bearingDeg: number;
  uncertaintyM: number;
  source: string;
}

/** A measured rectangular frame becomes ordinary anchors, validated again by the existing API. */
export function buildSeatFrame(input: SeatFrameInput, seats: SeatPoint[]) {
  const { latitude, longitude, widthM, lengthM, bearingDeg, uncertaintyM } = input;
  if (![latitude, longitude, widthM, lengthM, bearingDeg, uncertaintyM].every(Number.isFinite)
    || Math.abs(latitude) > 85 || Math.abs(longitude) > 180 || widthM < 2 || widthM > 60
    || lengthM < 3 || lengthM > 120 || bearingDeg < 0 || bearingDeg > 360
    || uncertaintyM < .1 || uncertaintyM > 20) throw new Error("Revisá el centro, las medidas, la orientación y el error del plano.");
  if (input.source.trim().length < 5 || input.source.trim().length > 400) throw new Error("Indicá la fuente y fecha de las medidas (entre 5 y 400 caracteres).");
  if (seats.length < 3 || new Set(seats.map(s => s.id)).size !== seats.length
    || seats.some(s => !Number.isFinite(s.x + s.y) || s.x < 0 || s.x > 1000 || s.y < 0 || s.y > 1600)) throw new Error("No hay una geometría de asientos válida para calibrar.");
  const angle = bearingDeg * Math.PI / 180;
  const longitudeScale = METERS_PER_DEGREE * Math.cos(latitude * Math.PI / 180);
  const positions = seats.map(seat => {
    const right = (seat.x / 1000 - .5) * widthM;
    const up = (.5 - seat.y / 1600) * lengthM;
    const east = right * Math.cos(angle) + up * Math.sin(angle);
    const north = -right * Math.sin(angle) + up * Math.cos(angle);
    return { seatId: seat.id, east, north, latitude: latitude + north / METERS_PER_DEGREE,
      longitude: ((longitude + east / longitudeScale + 540) % 360) - 180 };
  });
  if (positions.some(p => Math.abs(p.latitude) > 85)) throw new Error("Las posiciones calculadas salen del rango geográfico admitido.");
  // Wide, noncollinear anchors avoid numerical instability; IDs and layout remain unchanged.
  const first = positions[0]!;
  const distance = (a: typeof first, b: typeof first) => Math.hypot(a.east - b.east, a.north - b.north);
  const second = positions.reduce((best, p) => distance(first, p) > distance(first, best) ? p : best);
  const area = (p: typeof first) => Math.abs((second.east - first.east) * (p.north - first.north) - (second.north - first.north) * (p.east - first.east));
  const third = positions.reduce((best, p) => area(p) > area(best) ? p : best);
  if (area(third) < .01) throw new Error("Los asientos no forman referencias distintas y no alineadas.");
  let separationM = Infinity;
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) separationM = Math.min(separationM, distance(positions[i]!, positions[j]!));
  if (separationM < .001) throw new Error("Hay asientos superpuestos en el mapa; revisá sus posiciones.");
  const calibration: SeatCalibrationInput = {
    anchors: [first, second, third].map(({ seatId, latitude: lat, longitude: lon }) => ({ seatId, latitude: lat, longitude: lon })) as SeatCalibrationInput["anchors"],
    uncertaintyM,
    source: `Centro y medidas (${widthM} × ${lengthM} m; norte del dibujo ${bearingDeg}°): ${input.source.trim()}`,
  };
  if (calibration.source.length > 500) throw new Error("Acortá la descripción de la fuente para guardar estas referencias.");
  // Necessary best-case budget, not a promise: the server also checks the actual fix and availability.
  const maxDeviceAccuracyM = Math.max(0, Math.min(1, separationM / 2) - uncertaintyM - .001);
  return { calibration, positions, separationM, maxDeviceAccuracyM };
}
