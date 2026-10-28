import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { schema } from "@sala/database";
import { GARDEN_MAX_GIFT_SEEDS } from "@sala/contracts";
import { env } from "../env.js";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";

describe("superadmin seed gifts",()=>{
  let ctx:ReturnType<typeof buildTestApp>,app:ReturnType<typeof createApp>,actor:string|null,ownerEmail:string;
  const gift=()=>({grantId:crypto.randomUUID(),seeds:100,reason:"Colaboración de prueba"});
  const send=(body:unknown,target="recipient",origin?:string)=>app.request(`/api/v1/admin/users/${target}/garden/seeds`,{method:"POST",headers:baseHeaders({"content-type":"application/json",...(origin?{origin}:{})}),body:JSON.stringify(body)});
  beforeEach(async()=>{
    ownerEmail=env.ownerEmail;env.ownerEmail="gift-owner@example.test";ctx=buildTestApp();
    await insertUsers(ctx.db,["gift-owner","staff","moderator","recipient","other"]);
    ctx.db.update(schema.user).set({emailVerified:true}).run();
    ctx.db.insert(schema.userRoles).values([{userId:"gift-owner",role:"ADMIN"},{userId:"staff",role:"ADMIN"},{userId:"moderator",role:"MODERATOR"}]).run();
    ctx.db.insert(schema.userProfiles).values({userId:"recipient",identityMode:"HIDDEN",firstName:"Hidden recipient",alias:"Coipo de prueba"}).run();
    actor="gift-owner";
    const auth={api:{getSession:async()=>actor?{user:{id:actor,name:actor,email:`${actor}@example.test`,emailVerified:true}}:null}} as unknown as Auth;
    app=createApp({services:ctx.services,auth});
  });
  afterEach(()=>{env.ownerEmail=ownerEmail;});

  it("credits, audits and notifies once, even across simultaneous retries or after audit retention",async()=>{
    const request=gift();const before=await ctx.services.garden.get("recipient");
    const responses=await Promise.all([send(request),send(request)]);expect(responses.map(r=>r.status)).toEqual([200,200]);
    const after=await ctx.services.garden.get("recipient");expect(after.seeds).toBe(before.seeds+100);expect(after.plants).toEqual(before.plants);expect(after.studyMinutes).toBe(before.studyMinutes);
    expect(ctx.db.select().from(schema.gardenSeedGrants).all()).toHaveLength(1);
    const actions=ctx.db.select().from(schema.moderationActions).all();expect(actions).toHaveLength(1);expect(actions[0]).toMatchObject({actorId:"gift-owner",targetUserId:"recipient",action:"GARDEN_SEEDS_GRANTED",metadata:{seeds:100,reason:request.reason}});
    expect(ctx.hub.eventsFor("garden:changed")).toMatchObject([{to:"user:recipient",payload:{reason:"seeds"}}]);
    ctx.db.delete(schema.moderationActions).run();
    expect(await (await send(request)).json()).toMatchObject({duplicate:true,seeds:100});expect((await ctx.services.garden.get("recipient")).seeds).toBe(after.seeds);expect(ctx.hub.eventsFor("garden:changed")).toHaveLength(1);
  });
  it("forbids ordinary admins, moderators, members, anonymous and stale/unverified owner identities",async()=>{
    for(const who of ["staff","moderator","recipient",null]){actor=who;expect((await send(gift())).status).toBe(who?403:401);}
    actor="gift-owner";ctx.db.update(schema.user).set({emailVerified:false}).where(eq(schema.user.id,actor)).run();expect((await send(gift())).status).toBe(403);
    expect(ctx.db.select().from(schema.gardenSeedGrants).all()).toEqual([]);expect(ctx.db.select().from(schema.userGardens).all()).toEqual([]);
    await expect(ctx.services.gardenGifts.grant("staff","recipient",gift())).rejects.toMatchObject({status:403});
  });
  it("rejects changed receipt ownership, invalid amounts, unknown fields and cross-site requests",async()=>{
    const request=gift();await send(request);
    expect((await send({...request,seeds:101})).status).toBe(400);expect((await send(request,"other")).status).toBe(400);
    for(const seeds of [-1,0,1.5,GARDEN_MAX_GIFT_SEEDS+1])expect((await send({...gift(),seeds})).status).toBe(400);
    expect((await send({...gift(),canManageAdmins:true})).status).toBe(400);expect((await send(gift(),"recipient","https://outside.example")).status).toBe(403);
    expect((await send(gift(),"missing")).status).toBe(404);expect((await ctx.services.garden.get("recipient")).seeds).toBe(130);
  });
  it("rolls back the balance and receipt if the audit cannot be saved",async()=>{
    ctx.db.run(sql`CREATE TRIGGER reject_test_gift BEFORE INSERT ON moderation_actions WHEN NEW.action='GARDEN_SEEDS_GRANTED' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END`);
    await expect(ctx.services.gardenGifts.grant("gift-owner","recipient",gift())).rejects.toThrow();
    expect(ctx.db.select().from(schema.gardenSeedGrants).all()).toEqual([]);expect(ctx.db.select().from(schema.userGardens).all()).toEqual([]);
  });
  it("keeps gift details private from staff auditing and deletes receipts with the recipient",async()=>{
    await send(gift());
    const own=await ctx.services.adminAudit.list(undefined,undefined,true);expect(own.items[0]!.metadata).toMatchObject({seeds:100});
    const staff=await ctx.services.adminAudit.list(undefined,undefined,false);expect(staff.items[0]).toMatchObject({metadata:null,targetName:"Coipo de prueba"});
    await ctx.db.delete(schema.user).where(eq(schema.user.id,"recipient"));expect(ctx.db.select().from(schema.gardenSeedGrants).all()).toEqual([]);
  });
});
