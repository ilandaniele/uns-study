"use client";
import { useRef, useState, type FormEvent } from "react";
import { GiftIcon, LeafIcon } from "@phosphor-icons/react/dist/ssr";
import { GARDEN_MAX_GIFT_SEEDS, gardenSeedGiftSchema, type GardenSeedGiftDto, type GardenSeedGiftRequest } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";

export function OwnerSeedGift({userId,displayName}:{userId:string;displayName:string}) {
  const {me}=useMe();
  if(!me?.isSuperAdmin)return null;
  return <GiftForm key={`${me.user?.id}:${userId}`} userId={userId} displayName={displayName}/>;
}

function GiftForm({userId,displayName}:{userId:string;displayName:string}) {
  const [seeds,setSeeds]=useState("100");
  const [reason,setReason]=useState("Reconocimiento por colaborar en la sala");
  const [approved,setApproved]=useState<GardenSeedGiftRequest|null>(null);
  const [attempted,setAttempted]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const busy=useRef(false);

  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy.current)return;
    setError("");setNotice("");
    if(!approved){
      const parsed=gardenSeedGiftSchema.safeParse({grantId:crypto.randomUUID(),seeds:Number(seeds),reason});
      if(!parsed.success){setError("Ingresá entre 1 y 10.000 semillas y un motivo de 3 a 200 caracteres.");return;}
      setApproved(parsed.data);return;
    }
    busy.current=true;setPending(true);setAttempted(true);
    try{
      const result=await apiFetch<GardenSeedGiftDto>(`/api/v1/admin/users/${encodeURIComponent(userId)}/garden/seeds`,{method:"POST",body:JSON.stringify(approved)});
      setNotice(`Regalo confirmado: ${result.seeds.toLocaleString("es-AR")} semillas para ${displayName}.`);
      setApproved(null);setAttempted(false);
    }catch(e){
      setError(e instanceof Error?e.message:"No pudimos confirmar el regalo. Reintentá el mismo envío.");
      // An uncertain delivery keeps its original receipt, amount and recipient for a safe retry.
      if(e instanceof ApiRequestError && e.status>=400 && e.status<500){setApproved(null);setAttempted(false);}
    }finally{busy.current=false;setPending(false);}
  }

  return <details className="rounded-2xl border border-app bg-surface-2 p-4">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-primary [&::-webkit-details-marker]:hidden"><GiftIcon size={21} aria-hidden="true"/>Regalar semillas</summary>
    <p className="mt-2 text-xs text-muted">Regalo del súper admin para el jardín de {displayName}. Queda registrado con su motivo.</p>
    <form className="mt-4 space-y-3" onSubmit={event=>void submit(event)}>
      <label className="block text-sm font-semibold">Cantidad de semillas<input type="number" inputMode="numeric" min={1} max={GARDEN_MAX_GIFT_SEEDS} step={1} required disabled={approved!==null} value={seeds} onChange={e=>setSeeds(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-app bg-surface px-3 text-main disabled:opacity-60"/></label>
      <label className="block text-sm font-semibold">Motivo del regalo<input type="text" minLength={3} maxLength={200} required disabled={approved!==null} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-app bg-surface px-3 text-main disabled:opacity-60"/></label>
      {approved ? <p className="rounded-xl border border-app bg-surface p-3 text-sm">Vas a regalar <strong>{approved.seeds.toLocaleString("es-AR")} semillas</strong> a <strong>{displayName}</strong>.</p> : null}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><LeafIcon size={17} aria-hidden="true"/>{pending?"Confirmando…":approved?attempted?"Reintentar mismo regalo":"Confirmar regalo":"Revisar regalo"}</button>{approved && !attempted ? <button type="button" disabled={pending} onClick={()=>setApproved(null)} className="min-h-11 rounded-full border border-app px-4 text-sm">Cancelar regalo</button> : null}</div>
      {attempted && !pending && error ? <p className="text-xs text-muted">Si ya se acreditó, el reintento sólo confirma ese mismo regalo.</p> : null}
      <div aria-live="polite" aria-atomic="true">{notice?<p role="status" className="text-sm font-semibold text-primary">{notice}</p>:null}{error?<p role="alert" className="text-sm text-occupied">{error}</p>:null}</div>
    </form>
  </details>;
}
