import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusCommandRequest, FocusSyncDto } from "@sala/contracts";
import { DEFAULT_SETTINGS, initialState, pause, start } from "./pomodoro";
const mocks=vi.hoisted(()=>({fetch:vi.fn(),events:new Map<string,()=>void>()}));
vi.mock("@/lib/api",async importOriginal=>({...await importOriginal<object>(),apiFetch:mocks.fetch}));
vi.mock("@/lib/socket",()=>({getSocket:()=>({on(event:string,fn:()=>void){mocks.events.set(event,fn);return this;},off(event:string){mocks.events.delete(event);return this;}})}));
const drain=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};

describe("account focus synchronization",()=>{
 let cleanup:(()=>void)|undefined;
 let remote:FocusSyncDto;
 beforeEach(()=>{
   vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-28T15:00:00Z"));mocks.fetch.mockReset();mocks.events.clear();
   const storage=new Map<string,string>();
   vi.stubGlobal("window",Object.assign(new EventTarget(),{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},setInterval,clearInterval}));
   vi.stubGlobal("document",Object.assign(new EventTarget(),{visibilityState:"visible"}));
   remote={version:0,state:null,serverNow:Date.now()};
   mocks.fetch.mockImplementation(async(_path:string,options?:RequestInit)=>{
     if(options?.method==="POST"){
       const request=JSON.parse(options.body as string) as FocusCommandRequest;
       const state=remote.state??{settings:DEFAULT_SETTINGS,timer:initialState(DEFAULT_SETTINGS),stats:{days:{}}};
       if(request.command.action==="start")state.timer=start(state.timer,Date.now());
       if(request.command.action==="pause")state.timer=pause(state.timer,Date.now());
       remote={version:remote.version+1,state,serverNow:Date.now()};
     }
     return structuredClone(remote);
   });
 });
 afterEach(()=>{cleanup?.();cleanup=undefined;vi.unstubAllGlobals();vi.useRealTimers();});
 it("uploads actions and refreshes another device's private change without broadcasting local preferences",async()=>{
   const {startFocusSync}=await import("./focus-sync");const store=await import("./focus-store");
   cleanup=startFocusSync("person-a",vi.fn());await drain();store.focusActions.toggle();await drain();
   expect(remote.state!.timer.status).toBe("running");expect(store.getFocus().timer.endsAt).toBe(remote.state!.timer.endsAt);
   const post=mocks.fetch.mock.calls.find(([,options])=>options?.method==="POST")!;
   expect(JSON.parse(post[1].body)).toEqual({version:0,command:{action:"start"}});
   remote={...remote,version:remote.version+1,state:{...remote.state!,timer:pause(remote.state!.timer,Date.now())}};
   mocks.events.get("focus:changed")!();await drain();expect(store.getFocus().timer.status).toBe("paused");
 });
 it("does not copy old unscoped history into an authenticated account automatically",async()=>{
   window.localStorage.setItem("sala.focus.v1",JSON.stringify({stats:{days:{"2026-10-27":{sessions:4,minutes:100}}}}));
   const {startFocusSync}=await import("./focus-sync");const store=await import("./focus-store");cleanup=startFocusSync("person-a",vi.fn());await drain();
   expect(store.getFocus().stats.days).toEqual({});expect(mocks.fetch.mock.calls.every(([,options])=>options?.method!=="POST")).toBe(true);
 });
 it("ignores a late reply after signing into a different account",async()=>{
   const {startFocusSync}=await import("./focus-sync");const store=await import("./focus-store");
   cleanup=startFocusSync("person-a",vi.fn());await drain();
   let deliver!:(value:FocusSyncDto)=>void;
   mocks.fetch.mockImplementationOnce(()=>new Promise<FocusSyncDto>(resolve=>{deliver=resolve;}));
   store.focusActions.toggle();await drain();cleanup();cleanup=startFocusSync("person-b",vi.fn());await drain();
   deliver({version:8,serverNow:Date.now(),state:{settings:DEFAULT_SETTINGS,timer:start(initialState(DEFAULT_SETTINGS),Date.now()),stats:{days:{"2026-10-27":{sessions:99,minutes:99}}}}});await drain();
   expect(store.getFocus().timer.status).toBe("idle");expect(store.getFocus().stats.days).toEqual({});
 });
 it("keeps local completion working offline and queues one server settlement",async()=>{
   const {startFocusSync}=await import("./focus-sync");const store=await import("./focus-store");cleanup=startFocusSync("person-a",vi.fn());await drain();store.focusActions.toggle();await drain();
   mocks.fetch.mockRejectedValue(new TypeError("offline"));vi.setSystemTime(Date.now()+25*60000+1);
   expect(store.focusActions.settle(Date.now())).toHaveLength(1);await drain();
   expect(store.getFocus().timer.phase).toBe("short");expect(store.getFocus().stats.days["2026-10-28"]!.sessions).toBe(1);
   expect(mocks.fetch.mock.calls.filter(([,options])=>options?.method==="POST"&&JSON.parse(options.body).command.action==="settle")).toHaveLength(1);
 });
});
