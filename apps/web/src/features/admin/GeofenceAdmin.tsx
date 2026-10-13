"use client";

import type { GeofenceTestResultDto, LocationInput, RoomGeofenceDto } from "@sala/contracts";
import { CheckIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { getFreshLocation, GeolocationRequestError } from "@/lib/geolocation";

/** Accuracy required before "Usar mi ubicación como centro" is enabled — a coarse fix would miscalibrate the room. */
const MAX_CENTER_ACCURACY_M = 30;

export function GeofenceAdmin({ roomSlug }: { roomSlug: string }) {
  const [geofence, setGeofence] = useState<RoomGeofenceDto | null>(null);
  const [radiusInput, setRadiusInput] = useState("");
  const [testResult, setTestResult] = useState<GeofenceTestResultDto | null>(null);
  const [lastLocation, setLastLocation] = useState<LocationInput | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<RoomGeofenceDto>(`/api/v1/admin/rooms/${roomSlug}/geofence`);
      setGeofence(dto);
      setRadiusInput(String(dto.radiusM));
    } catch {
      setError("No pudimos cargar la ubicación de la sala.");
    }
  }, [roomSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void load();
  }, [load]);

  async function testMyLocation() {
    setError(null);
    setTesting(true);
    try {
      const location = await getFreshLocation();
      setLastLocation(location);
      const result = await apiFetch<GeofenceTestResultDto>(`/api/v1/admin/rooms/${roomSlug}/geofence/test`, {
        method: "POST",
        body: JSON.stringify({ location }),
      });
      setTestResult(result);
    } catch (err) {
      setTestResult(null);
      setLastLocation(null);
      if (err instanceof GeolocationRequestError) setError(err.message);
      else if (err instanceof ApiRequestError) setError(err.message);
      else setError("No pudimos probar tu ubicación.");
    } finally {
      setTesting(false);
    }
  }

  async function applyMyLocationAsCenter() {
    if (!lastLocation || !testResult || testResult.accuracyM > MAX_CENTER_ACCURACY_M) return;
    const confirmed = window.confirm(
      "¿Confirmás que estás parado en el centro de la sala? Esto va a reemplazar el centro del geofence por tu ubicación actual.",
    );
    if (!confirmed) return;

    await save({ latitude: lastLocation.latitude, longitude: lastLocation.longitude });
  }

  async function saveRadius() {
    if (!geofence) return;
    const radiusM = Number(radiusInput);
    if (!Number.isFinite(radiusM)) {
      setError("El radio tiene que ser un número.");
      return;
    }
    await save({ latitude: geofence.latitude, longitude: geofence.longitude, radiusM });
  }

  async function save(next: { latitude: number; longitude: number; radiusM?: number }) {
    if (!geofence) return;
    setError(null);
    setSaving(true);
    try {
      const radiusM = next.radiusM ?? Number(radiusInput) ?? geofence.radiusM;
      const updated = await apiFetch<RoomGeofenceDto>(`/api/v1/admin/rooms/${roomSlug}/geofence`, {
        method: "PUT",
        body: JSON.stringify({ latitude: next.latitude, longitude: next.longitude, radiusM }),
      });
      setGeofence(updated);
      setRadiusInput(String(updated.radiusM));
      setTestResult(null);
      setLastLocation(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "No pudimos guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  if (!geofence) {
    return error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null;
  }

  const mapUrl = `https://www.openstreetmap.org/?mlat=${geofence.latitude}&mlon=${geofence.longitude}#map=19/${geofence.latitude}/${geofence.longitude}`;
  const canUseAsCenter = Boolean(testResult && testResult.accuracyM <= MAX_CENTER_ACCURACY_M);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 border-t border-app pt-4">
        <p className="text-sm font-semibold text-main">Centro actual</p>
        <p className="font-mono text-sm text-muted">
          {geofence.latitude.toFixed(6)}, {geofence.longitude.toFixed(6)}
        </p>
        <a href={mapUrl} target="_blank" rel="noreferrer" className="w-fit text-sm font-medium text-primary underline">
          Ver en el mapa
        </a>
      </div>

      <div className="flex flex-col gap-3 border-t border-app pt-4">
        <p className="text-sm font-semibold text-main">Probar mi ubicación</p>
        <button
          type="button"
          onClick={() => void testMyLocation()}
          disabled={testing}
          className="w-fit rounded-lg border border-app px-4 py-2 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          {testing ? "Midiendo…" : "Probar mi ubicación"}
        </button>

        {testResult ? (
          <p className="text-sm text-muted">
            Estás a {testResult.distanceM} m del centro (±{testResult.accuracyM} m). Aceptamos hasta {testResult.allowedM} m:{" "}
            <span className={testResult.valid ? "font-semibold" : "font-semibold text-[var(--seat-occupied)]"} style={testResult.valid ? { color: "var(--seat-free)" } : undefined}>
              {testResult.valid ? <CheckIcon aria-hidden="true" size={14} weight="bold" className="mr-0.5 inline align-[-2px]" /> : <XIcon aria-hidden="true" size={14} weight="bold" className="mr-0.5 inline align-[-2px]" />}
              {testResult.valid ? "pasaría" : "no pasaría"}
            </span>
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void applyMyLocationAsCenter()}
          disabled={!canUseAsCenter || saving}
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Usar mi ubicación como centro
        </button>
        {testResult && !canUseAsCenter ? (
          <p className="text-xs text-muted">Necesitás una precisión de hasta {MAX_CENTER_ACCURACY_M} m para poder usar esta ubicación como centro.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-app pt-4">
        <p className="text-sm font-semibold text-main">Radio del geofence</p>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Radio (metros)
          <input
            type="number"
            min={20}
            max={300}
            value={radiusInput}
            onChange={(e) => setRadiusInput(e.target.value)}
            className="w-32 rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void saveRadius()}
          disabled={saving}
          className="w-fit rounded-lg border border-app px-4 py-2 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          Guardar radio
        </button>
      </div>

      {error ? <p className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}
    </div>
  );
}
