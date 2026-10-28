"use client";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { importLegacyFocus, useFocusSyncStatus } from "./focus-sync";
const LABELS={local:"El reloj se guarda en este dispositivo.",connecting:"Conectando tu reloj…",synced:"Tu reloj está sincronizado con tus dispositivos.",offline:"Sin conexión. El reloj sigue en este dispositivo; reintentamos al volver.",conflict:"El reloj cambió en otro dispositivo. Ya lo actualizamos; volvé a intentar tu acción."};
export function FocusSyncStatus(){
 const {phase,canImport}=useFocusSyncStatus();
 return <div className="rounded-2xl border border-app bg-surface px-4 py-3 text-xs text-muted"><p role="status" className="flex items-center gap-2"><ArrowsClockwiseIcon size={16} aria-hidden="true" className="shrink-0"/>{LABELS[phase]}</p>{canImport ? <div className="mt-3 border-t border-app pt-3"><p>Hay un reloj anterior guardado en este dispositivo. Podés traerlo a tu cuenta si es tuyo.</p><button type="button" onClick={importLegacyFocus} className="mt-2 min-h-11 rounded-full border border-app px-4 font-semibold text-primary">Traer mi reloj anterior</button></div> : null}</div>;
}
