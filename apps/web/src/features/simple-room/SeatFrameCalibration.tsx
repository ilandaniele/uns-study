"use client";

import { useId, useState, type FormEvent } from "react";
import type { RoomMapDto, SeatCalibrationInput } from "@sala/contracts";
import { getSeatLocation } from "@/lib/geolocation";
import { buildSeatFrame, type SeatFrameInput } from "./seat-frame";

const fields = [
  { key: "latitude", label: "Latitud del centro", min: -85, max: 85 },
  { key: "longitude", label: "Longitud del centro", min: -180, max: 180 },
  { key: "widthM", label: "Ancho representado (m)", min: 2, max: 60 },
  { key: "lengthM", label: "Largo representado (m)", min: 3, max: 120 },
  { key: "bearingDeg", label: "Orientación de las ventanas (°)", min: 0, max: 360 },
  { key: "uncertaintyM", label: "Error máximo del plano (m)", min: .1, max: 20 },
] as const;
const initial = { latitude: "", longitude: "", widthM: "", lengthM: "", bearingDeg: "", uncertaintyM: "", source: "" };
type Preview = ReturnType<typeof buildSeatFrame> & { input: SeatFrameInput };
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-app px-4 text-sm font-semibold disabled:opacity-50";

/** Owner-only draft. Preview and GPS diagnostics never write calibration or presence. */
export function SeatFrameCalibration({ map, roomCenter, pending, onSave }: {
  map: RoomMapDto;
  roomCenter?: { latitude: number; longitude: number } | null;
  pending: boolean;
  onSave: (input: SeatCalibrationInput) => Promise<boolean>;
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [fixWarning, setFixWarning] = useState("");
  function update(key: keyof typeof initial, value: string) {
    setValues(current => ({ ...current, [key]: value }));
    setPreview(null); setAccuracy(null); setFixWarning(""); setMessage(""); setError("");
  }
  function calculate(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if (fields.some(f => !values[f.key].trim())) throw new Error("Completá todas las medidas antes de calcular.");
      const input: SeatFrameInput = { latitude: Number(values.latitude), longitude: Number(values.longitude), widthM: Number(values.widthM), lengthM: Number(values.lengthM), bearingDeg: Number(values.bearingDeg), uncertaintyM: Number(values.uncertaintyM), source: values.source };
      setPreview({ ...buildSeatFrame(input, map.seats), input });
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "No pudimos calcular el plano."); }
  }
  async function measure() {
    setMeasuring(true); setAccuracy(null); setFixWarning(""); setError("");
    try {
      const fix = await getSeatLocation();
      setAccuracy(fix.accuracy);
      const age = Date.now() - Date.parse(fix.capturedAt);
      if (age < -1000 || age > 10_000 || fix.accuracy <= 0) setFixWarning("Esta muestra no es reciente o su precisión no es válida para asignar asientos. Volvé a medir.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos medir la precisión del teléfono."); }
    finally { setMeasuring(false); }
  }
  async function activate() {
    if (!preview || pending || measuring) return;
    if (await onSave(preview.calibration)) { setPreview(null); setMessage("Referencias guardadas. Cada intento seguirá comprobando precisión, cercanía y disponibilidad en el servidor."); }
  }
  return <div className="mt-5 rounded-2xl border border-app bg-surface p-4 sm:p-5">
    <h3 className="font-semibold">Calibrar desde el centro y las medidas</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted">Usá el centro geográfico, las medidas del área que representa el dibujo y su orientación real. No hace falta medir cada silla. El error debe incluir las diferencias entre el dibujo y el mobiliario.</p>
    <form onSubmit={calculate} className="mt-4 space-y-4">
      <fieldset disabled={pending || measuring} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Medidas y orientación del plano</legend>
        {fields.map(field => <label key={field.key} htmlFor={`${id}-${field.key}`} className="min-w-0 text-xs text-muted">{field.label}
          <input id={`${id}-${field.key}`} type="number" required step="any" min={field.min} max={field.max} value={values[field.key]} onChange={event => update(field.key, event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-app bg-surface px-3 text-sm text-main" />
        </label>)}
      </fieldset>
      {roomCenter ? <div className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        <button type="button" disabled={pending || measuring} onClick={() => {
          setValues(current => ({ ...current, latitude: String(roomCenter.latitude), longitude: String(roomCenter.longitude) })); setPreview(null); setAccuracy(null); setFixWarning(""); setMessage("");
        }} className="min-h-11 font-semibold text-primary underline disabled:opacity-50">Copiar el centro de cercanía configurado</button>
        <p>Ese punto sirve para el geofence; por sí solo no certifica el centro físico ni su precisión para ubicar sillas. Verificá su error antes de guardar.</p>
      </div> : null}
      <p className="text-xs leading-relaxed text-muted">La orientación indica hacia dónde apunta la parte superior del mapa (ventanas): 0° norte, 90° este, 180° sur, 270° oeste. No uses el rumbo del teléfono como orientación del edificio.</p>
      <label htmlFor={`${id}-source`} className="block text-sm text-muted">Fuente y fecha de las medidas
        <textarea id={`${id}-source`} required minLength={5} maxLength={400} rows={2} disabled={pending || measuring} value={values.source} onChange={event => update("source", event.target.value)} className="mt-1 w-full rounded-xl border border-app bg-surface p-3 text-main" />
      </label>
      <button type="submit" disabled={pending || measuring} className={button}>Previsualizar coordenadas</button>
    </form>
    {preview ? <div className="mt-5 border-t border-app pt-4">
      <p className="font-semibold">Borrador · {preview.positions.length} asientos calculados</p>
      <p className="mt-1 text-xs text-muted">Todavía no se guardó ni activó esta calibración.</p>
      <SeatFramePreview map={map} preview={preview} />
      <p className="text-sm leading-relaxed text-muted">Separación mínima calculada: {preview.separationM.toFixed(2)} m. Error del plano: {preview.input.uncertaintyM.toFixed(2)} m.</p>
      <p className="mt-2 text-sm font-semibold">{preview.maxDeviceAccuracyM > 0 ? `Para distinguir todas las sillas, el margen GPS tendría que ser menor a ${preview.maxDeviceAccuracyM.toFixed(3)} m, incluso justo sobre el asiento.` : "Con este margen del plano no se pueden distinguir automáticamente todas las sillas. Se mantendrá la confirmación cuando haya dudas."}</p>
      <button type="button" disabled={pending || measuring} onClick={() => void measure()} className={`${button} mt-4`}>{measuring ? "Midiendo…" : "Probar precisión de este dispositivo"}</button>
      <p className="mt-2 text-xs text-muted">La prueba pide ubicación sólo al tocar el botón. No guarda coordenadas, no cambia el centro y no ocupa asientos.</p>
      {accuracy !== null ? <p role="status" className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">Margen informado: {accuracy.toFixed(2)} m. {fixWarning || (accuracy < preview.maxDeviceAccuracyM ? "Cumple la condición inicial de precisión; el servidor también debe comprobar la posición real y los asientos vecinos." : "No alcanza para distinguir todas las sillas. El modo simple puede pedir confirmar el lugar.")}</p> : null}
      <button type="button" disabled={pending || measuring} onClick={() => void activate()} className="mt-5 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Guardando…" : "Guardar estas referencias"}</button>
    </div> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-occupied">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm font-semibold text-primary">{message}</p> : null}
  </div>;
}

function SeatFramePreview({ map, preview }: { map: RoomMapDto; preview: Preview }) {
  const scale = Math.min(230 / preview.input.widthM, 185 / preview.input.lengthM);
  const width = preview.input.widthM * scale, height = preview.input.lengthM * scale;
  const left = 170 - width / 2, top = 125 - height / 2;
  return <svg viewBox="0 0 360 260" width="360" height="260" role="img" aria-label={`Previsualización de ${map.seats.length} asientos; ventanas arriba y entrada abajo`} className="my-3 h-auto w-full rounded-xl bg-surface-2">
    <text x="170" y={top - 10} textAnchor="middle" fontSize="10" fill="currentColor">Ventanas</text>
    <rect x={left} y={top} width={width} height={height} rx="4" fill="none" stroke="currentColor" opacity=".5" />
    {map.seats.map(seat => <circle key={seat.id} cx={left + seat.x / 1000 * width} cy={top + seat.y / 1600 * height} r="2.4" className="fill-primary"><title>{seat.code}</title></circle>)}
    <path d="M166 125h8m-4-4v8" stroke="currentColor" strokeWidth="1.2" />
    <text x="170" y={top + height + 15} textAnchor="middle" fontSize="10" fill="currentColor">Entrada</text>
    <g transform={`translate(326 35) rotate(${-preview.input.bearingDeg})`}><path d="M0 12V-9m-4 5 4-7 4 7" fill="none" stroke="currentColor" strokeWidth="1.7" /></g>
    <text x="326" y="65" textAnchor="middle" fontSize="10" fill="currentColor">N</text>
  </svg>;
}
