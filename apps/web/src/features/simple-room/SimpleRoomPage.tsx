"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRoomState } from "@/features/room/useRoomState";
import { seatCodeLabel } from "@/features/room/format";
import { useSimpleRoom } from "./useSimpleRoom";
import { SimpleSeatConfirmation } from "./SimpleSeatConfirmation";
import { useQrContext } from "@/lib/qr-context";

const TurnstileChallenge = dynamic(() => import("@/features/room/TurnstileChallenge").then(m => m.TurnstileChallenge));
const LocationHelpDialog = dynamic(() => import("@/features/room/LocationHelpDialog").then(m => m.LocationHelpDialog));

export function SimpleRoomPage({ slug, onPendingChange }: { slug: string; onPendingChange: (pending: boolean) => void }) {
  const { map, me, error: loadError, refetch } = useRoomState(slug);
  const action = useSimpleRoom(map, refetch);
  const qr = useQrContext();
  useEffect(() => { onPendingChange(action.pending); return () => onPendingChange(false); }, [action.pending, onPendingChange]);
  const active = me?.activeCheckIn;
  const closed = map?.room.operatingHours?.open === false;
  const disabled = action.pending || !map || Boolean(closed && !active);
  const challenge = action.challenge ? <div className="mt-4"><TurnstileChallenge onToken={action.retryChallenge}/></div> : null;
  return <section aria-label="Sala en modo simple" className="mx-auto flex min-h-[65dvh] max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
    <h1 className="sr-only">Sala · Modo simple</h1>
    <div className="rounded-full p-4 shadow-[0_18px_40px_#0004] sm:p-5" style={{ background: "linear-gradient(135deg,#c9cdd0,#737a80 45%,#dce0e2 70%,#60676b)" }}>
      <div className="rounded-full bg-[#202327] p-2 shadow-inner">
        <button type="button" disabled={disabled} onClick={() => { if (active) void action.leave(); else void action.enter(); }}
          aria-label={active ? "Me voy de la sala" : "Estoy acá: encontrar mi asiento"} aria-busy={action.pending}
          className="flex h-52 w-52 flex-col items-center justify-center rounded-full border-[6px] border-[#8e0b12] px-6 text-2xl font-black text-white shadow-[inset_0_5px_8px_#fff5,inset_0_-10px_14px_#600a0c99,0_8px_0_#670a10,0_10px_12px_#0007] transition-transform duration-100 focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-primary active:shadow-[inset_0_5px_12px_#5008,0_3px_0_#670a10] disabled:opacity-60 motion-safe:active:translate-y-1 motion-reduce:transition-none sm:h-64 sm:w-64 sm:text-3xl"
          style={{ background: "radial-gradient(circle at 40% 25%,#ff5659,#e51924 55%,#ac0712)", textShadow: "0 2px 2px #65080c" }}>
          {action.locating ? "Ubicando…" : action.pending ? "Un momento…" : active ? "Me voy" : "Estoy acá"}
        </button>
      </div>
    </div>
    <div aria-live="polite" className="mt-8 max-w-sm text-sm leading-relaxed text-muted">
      {active ? <p><span className="font-semibold text-main">{seatCodeLabel(active.seatCode)}</span><br/>Tu lugar está marcado hasta las {new Date(active.expiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: map?.room.timezone ?? "America/Argentina/Buenos_Aires" })}.</p>
        : closed ? <p>La sala está cerrada. Podés volver a marcar cuando abra.</p>
        : !map ? <p>{loadError ?? "Preparando la sala…"}</p>
        : qr.qrToken && qr.seatCode ? <p>QR de <strong className="text-main">{seatCodeLabel(qr.seatCode)}</strong>. Tocá el botón cuando estés sentado ahí: identificamos el asiento y comprobamos que estés en la sala.</p>
        : <p>Tocalo cuando ya estés sentado. Usamos tu ubicación y te pedimos confirmar el asiento si hay dudas. También podés escanear el QR de tu asiento con la cámara del teléfono.</p>}
    </div>
    {loadError ? <button type="button" onClick={refetch} className="mt-3 min-h-11 rounded-full border border-app px-5 text-sm font-semibold text-main">Reintentar</button> : null}
    {action.error && !action.confirmation ? <p role="alert" className="mt-4 max-w-sm text-sm text-[var(--seat-occupied)]">{action.error}</p> : null}
    {!action.confirmation ? challenge : null}
    {map && action.confirmation ? <SimpleSeatConfirmation map={map} decision={action.confirmation} pending={action.pending} error={action.error} challenge={challenge} onConfirm={id => { void action.enter(id); }} onCancel={action.cancelConfirmation}/> : null}
    {action.locationHelp && !action.confirmation ? <LocationHelpDialog onClose={action.dismissLocationHelp}/> : null}
  </section>;
}
