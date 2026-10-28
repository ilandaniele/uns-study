import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { FocusCommand, FocusSyncDto } from "@sala/contracts";
import { DEFAULT_SETTINGS, initialState } from "@sala/contracts/focus-timer";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";

describe("personal account focus clock, HTTP and SQLite",()=>{
 let ctx:ReturnType<typeof buildTestApp>,app:ReturnType<typeof createApp>,actor:string|null,clock:FixedClock;
 const read=()=>app.request("/api/v1/me/focus",{headers:baseHeaders()});
 const command=(version:number,command:FocusCommand,extra={})=>app.request("/api/v1/me/focus",{method:"POST",headers:baseHeaders({"content-type":"application/json"}),body:JSON.stringify({version,command,...extra})});
 beforeEach(async()=>{ctx=buildTestApp();clock=ctx.services.clock as FixedClock;clock.set(new Date("2026-10-28T15:00:00Z"));await insertUsers(ctx.db,["laptop-user","other-user"]);actor="laptop-user";const auth={api:{getSession:async()=>actor?{user:{id:actor,name:actor,email:`${actor}@example.test`,emailVerified:true}}:null}} as unknown as Auth;app=createApp({services:ctx.services,auth});});
 it("shares start, pause, restart and completion with the same user's other device",async()=>{
   expect(await (await read()).json()).toMatchObject({version:0,state:null});
   const started=await (await command(0,{action:"start"})).json() as FocusSyncDto;
   expect(started.state!.timer).toMatchObject({status:"running",endsAt:clock.now().getTime()+25*60000});
   const phone=await (await read()).json() as FocusSyncDto;expect(phone).toEqual(started);
   clock.advance(30000);const paused=await (await command(started.version,{action:"pause"})).json() as FocusSyncDto;
   expect(paused.state!.timer).toMatchObject({status:"paused",remainingMs:25*60000-30000});
   expect(await (await read()).json()).toEqual(paused);
   const resumed=await (await command(paused.version,{action:"start"})).json() as FocusSyncDto;
   clock.advance(25*60000);
   const done=await (await read()).json() as FocusSyncDto;
   expect(done.state!.timer).toMatchObject({phase:"short",status:"running"});
   expect(done.state!.stats.days["2026-10-28"]).toEqual({sessions:1,minutes:25});
   expect((await (await read()).json() as FocusSyncDto).version).toBe(done.version);
   expect((await command(resumed.version,{action:"settle"})).status).toBe(409);
   expect((await (await read()).json() as FocusSyncDto).state!.stats).toEqual(done.state!.stats);
 });
 it("rejects a stale command instead of replaying an old laptop over a newer phone",async()=>{
   const started=await (await command(0,{action:"start"})).json() as FocusSyncDto;
   await command(started.version,{action:"pause"});
   expect((await command(started.version,{action:"resetAll"})).status).toBe(409);
   expect((await (await read()).json() as FocusSyncDto).state!.timer.status).toBe("paused");
 });
 it("keeps account state private, forbids forged ownership and sends only a private invalidation",async()=>{
   await command(0,{action:"start"});
   expect(ctx.hub.eventsFor("focus:changed")).toMatchObject([{to:"user:laptop-user",payload:{version:1}}]);
   expect(Object.keys(ctx.hub.eventsFor("focus:changed")[0]!.payload as object)).toEqual(["version"]);
   actor="other-user";const other=await read();expect(other.headers.get("cache-control")).toBe("private, no-store");expect(await other.json()).toMatchObject({state:null,version:0});
   expect((await command(0,{action:"pause"},{userId:"laptop-user"})).status).toBe(400);
   actor=null;expect((await read()).status).toBe(401);expect((await command(0,{action:"start"})).status).toBe(401);
 });
 it("settles a clock while its initiating device is closed, without game or ranking credit",async()=>{
   await command(0,{action:"setSettings",settings:{...DEFAULT_SETTINGS,focusMin:1}});
   const a=await (await read()).json() as FocusSyncDto;await command(a.version,{action:"start"});
   clock.advance(60001);const fromPhone=await (await read()).json() as FocusSyncDto;
   expect(fromPhone.state!.stats.days["2026-10-28"]!.sessions).toBe(1);
   expect(await ctx.db.select().from(schema.studySessions)).toEqual([]);
   expect(await ctx.db.select().from(schema.userGardens)).toEqual([]);
 });
 it("imports old personal history once, and account deletion removes the stored clock",async()=>{
   const state={settings:DEFAULT_SETTINGS,timer:initialState(DEFAULT_SETTINGS),stats:{days:{"2026-10-27":{sessions:4,minutes:100}}}};
   expect((await command(0,{action:"initialize",state})).status).toBe(200);
   expect((await command(0,{action:"initialize",state})).status).toBe(409);
   await ctx.db.delete(schema.user).where(eq(schema.user.id,"laptop-user"));
   expect(await ctx.db.select().from(schema.userFocus)).toEqual([]);
 });
 it("rejects foreign origins and invalid durations before any timer write",async()=>{
   expect((await app.request("/api/v1/me/focus",{method:"POST",headers:baseHeaders({origin:"https://outside.example","content-type":"application/json"}),body:JSON.stringify({version:0,command:{action:"start"}})})).status).toBe(403);
   expect((await command(0,{action:"setSettings",settings:{...DEFAULT_SETTINGS,focusMin:0}})).status).toBe(400);
   expect(await ctx.db.select().from(schema.userFocus)).toEqual([]);
 });
});
