"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Diagnostics { enabled: boolean; provider: string; model: string | null; lastAttemptAt: string | null; lastFailure: string | null }
const FAILURE: Record<string, string> = {
  TIMEOUT: "El proveedor tardó más de 9 segundos. Revisá el modelo y volvé a probar con una foto real desde la sala.",
  CREDENTIALS: "El proveedor rechazó las credenciales o los permisos. Revisá la configuración del Worker sin compartir claves en la app.",
  QUOTA: "Se alcanzó el cupo o límite del proveedor. Revisá cuota y facturación antes de volver a intentar.",
  MODEL: "El modelo configurado no está disponible. Revisá VERIFIER_MODEL y el catálogo del proveedor.",
  PROVIDER: "Falló la conexión con el proveedor. Probá más tarde y revisá su estado.",
  RESPONSE: "El modelo no devolvió un resultado válido. La foto no fue aceptada automáticamente.",
};
export function PhotoVerifierStatus() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => { try { const data = await apiFetch<Diagnostics>("/api/v1/admin/verification/status", { signal }); if (!signal?.aborted) { setData(data); setError(""); } } catch { if (!signal?.aborted) setError("No pudimos cargar el diagnóstico."); } }, []);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts a request; state changes only after the response
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function test() {
    if (testing) return;
    setTesting(true); setTestResult("");
    try {
      const result = await apiFetch<{ connected: boolean; simulated: boolean; failure: string | null }>("/api/v1/admin/verification/test", { method: "POST" });
      setTestResult(result.simulated ? "Modo simulado: no se consultó un proveedor real." : result.connected ? "El proveedor respondió correctamente. La identificación de un asiento requiere una foto real con referencias." : FAILURE[result.failure ?? "PROVIDER"] ?? "No pudimos conectar con el proveedor.");
      await load();
    } catch (error) { setTestResult(error instanceof Error ? error.message : "No pudimos comprobar la conexión."); }
    finally { setTesting(false); }
  }
  return <section aria-label="Diagnóstico de verificación por foto" className="mt-5 rounded-3xl border border-app bg-surface p-5"><h2 className="text-lg font-bold">Verificación por foto</h2><p className="mt-2 text-sm text-muted">Diagnóstico exclusivo del creador. No muestra claves, fotos ni datos de las personas.</p>
    {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : data ? <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-muted">Servicio</dt><dd className="font-semibold">{data.enabled ? `Configurado · ${data.provider}` : "Sin proveedor configurado"}</dd></div>{data.model ? <div><dt className="text-muted">Modelo</dt><dd className="break-words font-mono">{data.model}</dd></div> : null}<div><dt className="text-muted">Último intento desde este proceso</dt><dd>{data.lastAttemptAt ? new Date(data.lastAttemptAt).toLocaleString("es-AR") : "Todavía no hubo intentos desde el último reinicio"}</dd></div><div><dt className="text-muted">Resultado del proveedor</dt><dd>{data.lastFailure ? FAILURE[data.lastFailure] ?? "No se pudo completar la verificación." : data.lastAttemptAt ? "Respondió sin errores de conexión. Una foto puede seguir siendo ambigua." : "Se comprobará con la próxima verificación real."}</dd></div></dl> : <p role="status" className="mt-4 text-sm text-muted">Cargando diagnóstico…</p>}
    <button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-full border border-app px-5 text-sm font-semibold">Actualizar diagnóstico</button>
    <p className="mt-4 text-xs leading-relaxed text-muted">La prueba usa sólo el plano de la app y consume una consulta de IA. No verifica lugares, no envía fotos de personas ni modifica horas.</p>
    <button type="button" onClick={() => void test()} disabled={testing || !data?.enabled} className="mt-3 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{testing ? "Comprobando…" : "Comprobar conexión"}</button>
    {testResult ? <p role="status" className="mt-3 text-sm leading-relaxed">{testResult}</p> : null}
  </section>;
}
