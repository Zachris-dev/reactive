import test from "node:test";
import assert from "node:assert/strict";
import {
 DAY_MS,isInactive,canRevokeAdministrator,canRecoverCampaignGM,
 canReadCampaign,canManageCampaign,canReadResource,normalizeCampaignName,
 invitationValid,invitationSpec
} from "../../apps/character_server/src/policy.mjs";

const NOW=Date.parse("2026-11-21T12:00:00.000Z");
const ago=(days,extra=0)=>new Date(NOW-days*DAY_MS-extra).toISOString();
const admin={id:"a",is_admin:1,last_active_at:ago(1)};
const oldAdmin={id:"b",is_admin:1,last_active_at:ago(90)};
test("90-day cutoff: 89 days fails, exactly 90 days succeeds",()=>{
 assert.equal(isInactive(ago(89),NOW),false);
 assert.equal(isInactive(ago(90),NOW),true);
 assert.equal(isInactive(ago(90,-1),NOW),false);
 assert.equal(isInactive(ago(90,1),NOW),true);
});
test("malformed activity timestamp cannot authorize revocation",()=>{
 for(const x of [null,"","not a date"]) assert.equal(isInactive(x,NOW),false);
});
test("only another administrator can revoke an inactive admin",()=>{
 assert.equal(canRevokeAdministrator(admin,oldAdmin,2,NOW),true);
 assert.equal(canRevokeAdministrator({...admin,is_admin:0},oldAdmin,2,NOW),false);
 assert.equal(canRevokeAdministrator(admin,admin,2,NOW),false);
 assert.equal(canRevokeAdministrator(admin,oldAdmin,1,NOW),false);
 assert.equal(canRevokeAdministrator(admin,{...oldAdmin,is_admin:0},2,NOW),false);
 assert.equal(canRevokeAdministrator(admin,{...oldAdmin,last_active_at:ago(1)},2,NOW),false);
});
test("campaign GM recovery requires all GMs inactive",()=>{
 assert.equal(canRecoverCampaignGM(admin,[{last_active_at:ago(90)},{last_active_at:ago(91)}],NOW),true);
 assert.equal(canRecoverCampaignGM(admin,[{last_active_at:ago(100)},{last_active_at:ago(1)}],NOW),false);
 assert.equal(canRecoverCampaignGM(admin,[],NOW),false);
 assert.equal(canRecoverCampaignGM({...admin,is_admin:0},[{last_active_at:ago(100)}],NOW),false);
});
test("a GM is also a player; a player is not a GM",()=>{
 assert.equal(canReadCampaign({is_gm:1}),true);
 assert.equal(canReadCampaign({is_gm:0}),true);
 assert.equal(canManageCampaign({is_gm:1}),true);
 assert.equal(canManageCampaign({is_gm:0}),false);
 assert.equal(canReadCampaign(null),false);
});
test("private resource visible only to owner even if another user is GM/admin",()=>{
 const resource={visibility:"private",owner_id:"player"};
 assert.equal(canReadResource({id:"player"},{is_gm:0},resource),true);
 assert.equal(canReadResource({id:"gm"},{is_gm:1},resource),false);
 assert.equal(canReadResource({id:"admin",is_admin:1},{is_gm:0},resource),false);
});
test("campaign and GM visibility respect membership",()=>{
 const p={id:"p"},player={is_gm:0},gm={is_gm:1};
 assert.equal(canReadResource(p,player,{visibility:"campaign"}),true);
 assert.equal(canReadResource(p,gm,{visibility:"gm"}),true);
 assert.equal(canReadResource(p,player,{visibility:"gm"}),false);
 assert.equal(canReadResource(p,null,{visibility:"campaign"}),false);
});
test("test resources are invisible through ordinary read authorization",()=>{
 assert.equal(canReadResource({id:"a"},{is_gm:1},{visibility:"campaign",is_test_data:1}),false);
});
test("Unicode campaign names normalized and not restricted to Latin",()=>{
 assert.equal(normalizeCampaignName("  霧の王国  "),"霧の王国");
 assert.equal(normalizeCampaignName("  Þórsheimr  "),"Þórsheimr");
 assert.equal(normalizeCampaignName("a\u0308"),"ä");
 assert.equal(normalizeCampaignName("x".repeat(100)),"x".repeat(100));
 assert.throws(()=>normalizeCampaignName("x".repeat(101)));
 assert.throws(()=>normalizeCampaignName("  "));
 assert.throws(()=>normalizeCampaignName("a\n"));
});
test("invitation types and usage limits",()=>{
 assert.deepEqual(invitationSpec("gm",7,20),{kind:"gm",expiresDays:7,maxUses:1});
 assert.deepEqual(invitationSpec("player",7,20),{kind:"player",expiresDays:7,maxUses:1});
 assert.deepEqual(invitationSpec("group",7,20),{kind:"group",expiresDays:7,maxUses:20});
 assert.throws(()=>invitationSpec("admin"));
 assert.throws(()=>invitationSpec("group",0,5));
 assert.throws(()=>invitationSpec("group",7,101));
});
test("invites require remaining uses and expiry in future",()=>{
 const base={kind:"gm",expires_at:new Date(NOW+1000).toISOString(),uses:0,max_uses:1,revoked_at:null};
 assert.equal(invitationValid(base,NOW),true);
 assert.equal(invitationValid({...base,uses:1},NOW),false);
 assert.equal(invitationValid({...base,expires_at:new Date(NOW).toISOString()},NOW),false);
 assert.equal(invitationValid({...base,revoked_at:ago(1)},NOW),false);
 assert.equal(invitationValid({...base,kind:"admin"},NOW),false);
});
