"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { RoomMapDto, SeatCalibrationDto, SeatCalibrationInput } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { seatCodeLabel } from "@/features/room/format";
import { SeatFrameCalibration } from "./SeatFrameCalibration";

type Reference = { code: string; latitude: string; longitude: string };
const emptyReferences = (): Reference[] => ["M01-S01", "M01-S04", "M06-S01"].map(code => ({ code, latitude: "", longitude: "" }));

/** Mounted only in the owner-only location panel; the API independently enforces SUPERADMIN. */
export function SeatCalibrationAdmin({ roomSlug, roomCenter }: { roomSlug: string; roomCenter?: { latitude: number; longitude: number } | null }) {
  const [map, setMap] = useState<RoomMapDto | null>(null);
  const [data, setData] = useState<SeatCalibrationDto | null>(null);
  const [references, setReferences] = useState(emptyReferences);
  const [uncertainty, setUncertainty] = useState("");
  const [source, setSource] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/v1/admin/rooms/${encodeURIComponent(roomSlug)}/seat-calibration`;
  useEffect(() => {
    let alive = true;
    void Promise.all([apiFetch<RoomMapDto>(`/api/v1/rooms/${encodeURIComponent(roomSlug)}/map`), apiFetch<SeatCalibrationDto>(endpoint)]).then(([roomMap, dto]) => {
      if (!alive) return;
      setMap(roomMap); setData(dto);
      if (dto.calibration) {
        setReferences(dto.calibration.anchors.map(anchor => ({ code: roomMap.seats.find(s => s.id === anchor.seatId)?.code ?? "", latitude: String(anchor.latitude), longitude: String(anchor.longitude) })));
        setUncertainty(String(dto.calibration.uncertaintyM)); setSource(dto.calibration.source);
      }
    }).catch(() => { if (alive) setError("No pudimos cargar las referencias de asientos."); });
    return () => { alive = false; };
  }, [roomSlug, endpoint]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!map || pending) return;
    setError(null);
    try {
      const anchors = references.map(ref => {
        const seat = map.seats.find(s => s.code === ref.code.trim().toUpperCase());
        if (!seat || !ref.latitude.trim() || !ref.longitude.trim()) throw new Error("Completá los tres asientos y sus coordenadas medidas.");
        return { seatId: seat.id, latitude: Number(ref.latitude), longitude: Number(ref.longitude) };
      }) as SeatCalibrationInput["anchors"];
      await saveInput({ anchors, uncertaintyM: Number(uncertainty), source });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar las referencias."); }
  }
  async function saveInput(input: SeatCalibrationInput): Promise<boolean> {
    if (pending) return false;
    setPending(true); setError(null);
    try {
      const dto = await apiFetch<SeatCalibrationDto>(endpoint, { method: "PUT", body: JSON.stringify(input) });
      setData(dto);
      if (dto.calibration && map) {
        setReferences(dto.calibration.anchors.map(anchor => ({ code: map.seats.find(s => s.id === anchor.seatId)?.code ?? "", latitude: String(anchor.latitude), longitude: String(anchor.longitude) })));
        setUncertainty(String(dto.calibration.uncertaintyM)); setSource(dto.calibration.source);
      }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar las referencias."); return false; }
    finally { setPending(false); }
  }
  async function disable() {
    if (pending) return;
    setPending(true); setError(null);
    try {
      await apiFetch(endpoint, { method: "DELETE" });
      setData({ calibration: null, matchesLayout: false, updatedAt: null, positions: [] });
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : "No pudimos desactivar la asignación automática."); }
    finally { setPending(false); }
  }
  return <section aria-labelledby="seat-calibration-title" className="mt-8 border-t border-app pt-6">
    <h2 id="seat-calibration-title" className="text-lg font-bold text-main">Asientos del modo simple</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted">El modo simple usa ubicación directamente, sin necesitar QR. Para ubicar las sillas podés usar un centro verificado, medidas y orientación, o tres asientos de referencia. La precisión del teléfono y el error del plano se comprueban en cada intento.</p>
    <p role="status" className="mt-3 rounded-xl bg-surface-2 p-3 text-sm font-semibold text-main">{data?.calibration && data.matchesLayout ? "Referencias cargadas: la asignación automática exige precisión suficiente en cada intento." : "Confirmación de asiento activa. No hay referencias medidas válidas para la asignación automática."}</p>
    {map ? <SeatFrameCalibration key={roomSlug} map={map} roomCenter={roomCenter} pending={pending} onSave={saveInput} /> : null}
    {map ? <details className="mt-5 rounded-2xl border border-app p-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Alternativa: tres asientos con coordenadas medidas</summary><form onSubmit={event => void save(event)} className="mt-3 space-y-4">
      <datalist id="simple-calibration-seats">{map.seats.map(seat => <option key={seat.id} value={seat.code}>{seatCodeLabel(seat.code)}</option>)}</datalist>
      {references.map((ref, index) => <fieldset key={index} disabled={pending} className="rounded-2xl border border-app p-4">
        <legend className="px-2 text-sm font-semibold text-main">Referencia {index + 1}</legend>
        <div className="grid gap-3 sm:grid-cols-3">{(["code", "latitude", "longitude"] as const).map(field => <label key={field} className="flex min-w-0 flex-col gap-1 text-xs text-muted">{field === "code" ? "Asiento" : field === "latitude" ? "Latitud medida" : "Longitud medida"}
          <input required type={field === "code" ? "text" : "number"} step={field === "code" ? undefined : "any"} list={field === "code" ? "simple-calibration-seats" : undefined} value={ref[field]}
            onChange={event => setReferences(current => current.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))}
            className="min-h-11 w-full rounded-xl border border-app bg-surface px-3 text-sm text-main"/>
        </label>)}</div>
      </fieldset>)}
      <label className="flex flex-col gap-1 text-sm text-muted">Error máximo de todo el plano, en metros
        <input required type="number" min="0.1" max="20" step="0.1" value={uncertainty} disabled={pending} onChange={event => setUncertainty(event.target.value)} className="min-h-11 rounded-xl border border-app bg-surface px-3 text-main"/>
      </label>
      <p className="text-xs text-muted">Incluí el error de las mediciones y del mobiliario. Este margen se suma al del dispositivo; no se reduce para forzar la asignación.</p>
      <div className="flex flex-col gap-1 text-sm text-muted">
        <label htmlFor={`seat-calibration-source-${roomSlug}`}>Fuente y fecha de las mediciones</label>
        <textarea id={`seat-calibration-source-${roomSlug}`} required minLength={5} maxLength={500} value={source} disabled={pending} onChange={event => setSource(event.target.value)} rows={2} className="rounded-xl border border-app bg-surface p-3 text-main"/>
      </div>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Guardando…" : "Guardar referencias medidas"}</button>
      </div>
    </form></details> : null}
    {data?.calibration ? <button type="button" disabled={pending} onClick={() => void disable()} className="mt-4 min-h-11 rounded-full border border-app px-5 text-sm font-semibold text-main disabled:opacity-50">Desactivar asignación automática</button> : null}
    <p className="mt-4 text-xs leading-relaxed text-muted">Fuentes públicas para consultar: <a href="https://servicios.uns.edu.ar/proyectos/edificios/complejo_alem.asp" target="_blank" rel="noreferrer" className="text-primary underline">esquema del Complejo Alem</a> y <a href="https://bc.uns.edu.ar/salasdelectura/" target="_blank" rel="noreferrer" className="text-primary underline">salas de lectura de la UNS</a>. No equivalen a una calibración medida de este mobiliario.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-[var(--seat-occupied)]">{error}</p> : null}
    {data?.positions.length ? <details className="mt-5 rounded-xl border border-app p-4"><summary className="cursor-pointer text-sm font-semibold text-primary">Ver coordenadas calculadas por asiento</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Asiento</th><th>Latitud</th><th>Longitud</th></tr></thead><tbody>{data.positions.map(position => <tr key={position.seatId} className="border-t border-app"><td className="py-2">{seatCodeLabel(map?.seats.find(s => s.id === position.seatId)?.code ?? "")}</td><td>{position.latitude.toFixed(7)}</td><td>{position.longitude.toFixed(7)}</td></tr>)}</tbody></table></div></details> : null}
  </section>;
}
