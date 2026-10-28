"use client";
import { useSyncExternalStore } from "react";
import type { FocusCommand, FocusSnapshot, FocusSyncDto } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Phase } from "./pomodoro";
import { applySyncedFocus, bindFocusAccount, getFocusSnapshot, hasScopedFocus, legacyFocusSnapshot, unbindFocusCommands } from "./focus-store";

type SyncPhase="local"|"connecting"|"synced"|"offline"|"conflict";
const INITIAL={phase:"local" as SyncPhase,canImport:false};
let status=INITIAL;
const listeners=new Set<()=>void>();
let importLegacy:(()=>void)|null=null;
function setStatus(phase:SyncPhase,canImport=status.canImport){if(status.phase===phase&&status.canImport===canImport)return;status={phase,canImport};for(const listener of listeners)listener();}
export function useFocusSyncStatus(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},()=>status,()=>INITIAL);}
export function importLegacyFocus(){importLegacy?.();}

/** One runtime per signed-in account. SQLite is canonical; socket messages only invalidate it. */
export function startFocusSync(userId:string|null,onTransition:(phase:Phase)=>void) {
  if(!userId){bindFocusAccount(null,null);setStatus("local",false);importLegacy=null;return()=>undefined;}
  let disposed=false,version=-1,busy=false,reading=false,offset=0;
  const queue:{command:FocusCommand;version?:number}[]=[];
  function enqueue(command:FocusCommand){
    if(disposed)return;
    if(command.action==="settle" && queue.some(item=>item.command.action==="settle"))return;
    if(queue.length>=30){setStatus("offline");return;}
    queue.push({command});void flush();
  }
  bindFocusAccount(userId,enqueue);
  const initial=hasScopedFocus()?getFocusSnapshot():null;
  const legacy=legacyFocusSnapshot();
  setStatus("connecting",false);

  function apply(dto:FocusSyncDto,started:number){
    if(disposed || dto.version<version)return;
    const previous=getFocusSnapshot();
    version=dto.version;offset=dto.serverNow-(started+Date.now())/2;
    if(dto.state)applySyncedFocus(dto.state,offset);
    // Only announce an actual phase boundary previously observed on this device.
    if(dto.state && previous.timer.status==="running" && previous.timer.endsAt!==null && previous.timer.endsAt<=Date.now()
      && (previous.timer.phase!==dto.state.timer.phase || Math.abs((dto.state.timer.endsAt??0)-offset-previous.timer.endsAt)>1000))onTransition(previous.timer.phase);
    setStatus("synced",!dto.state && Boolean(legacy));
  }
  async function refresh(){
    if(disposed || reading)return;
    if(queue.length && version>=0){void flush();return;}
    reading=true;
    const started=Date.now();
    try{
      const dto=await apiFetch<FocusSyncDto>("/api/v1/me/focus",{cache:"no-store"});
      if(disposed)return;
      const first=version<0;
      if(!first && queue.length)return;
      apply(dto,started);
      if(first && !dto.state && initial)queue.unshift({command:{action:"initialize",state:initial}});
    }catch{if(!disposed)setStatus("offline");}
    finally{reading=false;if(!disposed && version>=0)void flush();}
  }
  async function flush(){
    if(disposed || busy || version<0 || !queue.length)return;
    busy=true;
    try{
      while(queue.length && !disposed){
        const item=queue[0]!;
        item.version??=version;
        const started=Date.now();
        try{
          const dto=await apiFetch<FocusSyncDto>("/api/v1/me/focus",{method:"POST",body:JSON.stringify({version:item.version,command:item.command})});
          if(disposed)return;
          queue.shift();apply(dto,started);
        }catch(error){
          if(disposed)return;
          if(error instanceof ApiRequestError && (error.status===409 || error.status===400)){
            queue.length=0;
            const now=Date.now();
            const current=await apiFetch<FocusSyncDto>("/api/v1/me/focus",{cache:"no-store"});
            if(disposed)return;
            apply(current,now);if(item.command.action!=="settle")setStatus("conflict",false);
          }else setStatus("offline");
          break;
        }
      }
    }catch{if(!disposed)setStatus("offline");}
    finally{busy=false;}
  }
  importLegacy=()=>{
    if(!legacy || version!==0 || disposed || busy)return;
    // Old unscoped local history is imported only after the person explicitly chooses it.
    const state:FocusSnapshot={...legacy,timer:{...legacy.timer,endsAt:legacy.timer.endsAt===null?null:legacy.timer.endsAt+offset}};
    setStatus("connecting",false);enqueue({action:"initialize",state});
  };
  const visible=()=>{if(document.visibilityState==="visible")void refresh();};
  const socket=getSocket();
  socket.on("focus:changed",visible).on("connect",visible);
  document.addEventListener("visibilitychange",visible);
  window.addEventListener("focus",visible);window.addEventListener("online",visible);window.addEventListener("pageshow",visible);
  const poll=window.setInterval(visible,15000);
  void refresh();
  return()=>{disposed=true;importLegacy=null;queue.length=0;unbindFocusCommands();socket.off("focus:changed",visible).off("connect",visible);window.clearInterval(poll);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);window.removeEventListener("online",visible);window.removeEventListener("pageshow",visible);};
}
