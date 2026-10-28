"use client";
import { useRef, useState, type FormEvent } from "react";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import { moderationActionSchema, type ModerationActionType } from "@sala/contracts";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/me-store";

const ACTIONS:{type:ModerationActionType;label:string;adminOnly?:boolean}[]=[
  {type:"WARN",label:"Advertir"},{type:"MUTE_CHAT",label:"Silenciar chat"},
  {type:"RESTRICT_OBSERVATIONS",label:"Restringir reportes de lugares"},
  {type:"SUSPEND",label:"Suspender",adminOnly:true},{type:"BAN",label:"Banear",adminOnly:true},
  {type:"LIFT",label:"Levantar restricciones",adminOnly:true},
];
/** Moderation stays available without fetching private account/profile information. */
export function PublicModerationActions({userId,displayName}:{userId:string;displayName:string}){
  const {me}=useMe();
  if(!me?.user || me.user.id===userId || !me.roles.some(role=>role==="ADMIN"||role==="MODERATOR"))return null;
  return <ModerationForm key={`${me.user.id}:${userId}`} userId={userId} displayName={displayName} admin={me.roles.includes("ADMIN")}/>;
}
function ModerationForm({userId,displayName,admin}:{userId:string;displayName:string;admin:boolean}){
  const [type,setType]=useState<ModerationActionType>("WARN");
  const [reason,setReason]=useState("");
  const [until,setUntil]=useState("");
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const busy=useRef(false);
  async function submit(event:FormEvent){
    event.preventDefault();if(busy.current)return;
    busy.current=true;setPending(true);setMessage("");setError("");
    try{await apiPost(`/api/v1/admin/users/${encodeURIComponent(userId)}/actions`,{type,reason:reason.trim(),until:until?new Date(until).toISOString():null},moderationActionSchema);setMessage("Acción aplicada y registrada en auditoría.");setReason("");setUntil("");}
    catch(e){setError(e instanceof Error?e.message:"No pudimos aplicar la acción.");}
    finally{busy.current=false;setPending(false);}
  }
  return <details className="mt-4 rounded-2xl border border-app bg-surface p-4"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"><ShieldCheckIcon size={20} aria-hidden="true"/>Moderar a {displayName}</summary>
    <form onSubmit={event=>void submit(event)} className="mt-3 space-y-3">
      <label className="block text-sm">Acción<select value={type} disabled={pending} onChange={e=>setType(e.target.value as ModerationActionType)} className="mt-1 min-h-11 w-full rounded-xl border border-app bg-surface-2 px-3">{ACTIONS.filter(action=>!action.adminOnly||admin).map(action=><option key={action.type} value={action.type}>{action.label}</option>)}</select></label>
      <label className="block text-sm">Motivo<input value={reason} disabled={pending} required minLength={3} maxLength={500} onChange={e=>setReason(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-app bg-surface-2 px-3"/></label>
      <label className="block text-sm">Fin de la restricción (opcional)<input type="datetime-local" value={until} disabled={pending} onChange={e=>setUntil(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-app bg-surface-2 px-3"/></label>
      <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Aplicando…":"Aplicar acción de moderación"}</button>
      <div aria-live="polite">{message?<p role="status" className="text-sm text-primary">{message}</p>:null}{error?<p role="alert" className="text-sm text-occupied">{error}</p>:null}</div>
    </form>
  </details>;
}
