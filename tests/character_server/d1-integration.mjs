// End-to-end local D1 test. Creates temporary Wrangler persistence outside real dev data.
// Requires npm install in apps/character_server. NEVER uses a remote D1 database.
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../apps/character_server");
const config="wrangler.local.jsonc", database="reactive-character-server-local";
const cli=process.platform==="win32"?"npx.cmd":"npx", win=process.platform==="win32";
const port=8799,base="http://127.0.0.1:"+port;
let child,output="",checks=0;
const persistence=await mkdtemp(join(tmpdir(),"reactive-server-test-"));
function command(args){
 const r=spawnSync(cli,["wrangler",...args],{cwd:root,encoding:"utf8",shell:win,timeout:60000});
 if(r.status!==0)throw Error("Wrangler command failed: "+args.join(" ")+"\n"+r.stdout+"\n"+r.stderr);
}
async function api(path,actor,method="GET",data,fixtures=true){
 const res=await fetch(base+path,{
  method,
  headers:{"x-dev-user":actor,"x-dev-fixtures":fixtures?"1":"0",...(data!==undefined?{"content-type":"application/json"}:{})},
  body:data!==undefined?JSON.stringify(data):undefined
 });
 const result=await res.json();return {status:res.status,...result};
}
function check(actual,expected,description) {
 assert.equal(actual,expected,description);checks++;process.stdout.write("PASS "+description+"\n");
}
async function ready(){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error("Wrangler stopped unexpectedly: "+output);
  try{const r=await fetch(base+"/health");if(r.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw Error("Timed out waiting for local Wrangler: "+output);
}
try{
 const common=["--local","--persist-to",persistence,"--config",config];
 command(["d1","migrations","apply",database,...common]);
 command(["d1","execute",database,...common,"--file","fixtures/seed.sql","--yes"]);
 child=spawn(cli,["wrangler","dev","--local","--ip","127.0.0.1","--port",String(port),
  "--persist-to",persistence,"--config",config],{cwd:root,shell:win,stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",x=>{output+=String(x).slice(-3000)});
 child.stderr.on("data",x=>{output+=String(x).slice(-3000)});
 await ready();
 const gmCampaigns=await api("/api/campaigns","test_gm_a","GET",undefined,false);
 check(gmCampaigns.campaigns.length,0,"test campaigns hidden in normal member view");
 const all=await api("/api/campaigns?admin=1","test_admin","GET",undefined,false);
 check(all.campaigns.length,0,"test campaigns hidden in normal admin view");
 const dev=await api("/api/campaigns?admin=1","test_admin","GET",undefined,true);
 // explicit fixture view is enabled above; check the fixtures are present.
 check(dev.campaigns.length,3,"developer fixtures loaded");
 const createdNormal=await api("/api/campaigns","test_admin","POST",{name:"The Eldrich Race",is_test_data:false},false);
 check(createdNormal.status,201,"ordinary campaign creation succeeds");
 const createdTest=await api("/api/campaigns","test_admin","POST",{name:"Heart of Isolation",is_test_data:true},true);
 check(createdTest.name,"test_Heart of Isolation","test campaign name receives prefix automatically");
 const testList=await api("/api/campaigns","test_admin");
 check(testList.campaigns.some(c=>c.id===createdTest.id),true,"created test campaign appears in developer test list");
 check(testList.campaigns.some(c=>c.id===createdNormal.id),false,"ordinary campaigns are absent from test list");
 const normalList=await api("/api/campaigns","test_admin","GET",undefined,false);
 check(normalList.campaigns.some(c=>c.id===createdNormal.id),true,"created ordinary campaign appears in normal list");
 check(normalList.campaigns.some(c=>c.id===createdTest.id),false,"test campaigns are absent from ordinary list");
 // New campaign: a user who is neither an administrator nor an existing GM
 // creates it, becomes its first GM, and invites different recipients.
 const creatorBefore=await api("/api/me","test_creator");
 check(creatorBefore.user.is_admin,false,"campaign creator has no server administrator privileges");
 const creatorAdmin=await api("/api/admin/users","test_creator");
 check(creatorAdmin.status,403,"campaign creator cannot access server administration");
 const creatorCampaign=await api("/api/campaigns","test_creator","POST",
   {name:"Invitation Playground",is_test_data:true});
 check(creatorCampaign.status,201,"ordinary registered user creates a test campaign");
 check(creatorCampaign.name,"test_Invitation Playground","test name auto-prefixed for non-admin creator");
 const campaignId=creatorCampaign.id;
 const creatorMembers=await api("/api/campaigns/"+campaignId+"/members","test_creator");
 check(creatorMembers.members.length,1,"new campaign has exactly one initial member");
 check(creatorMembers.members[0].is_gm,1,"campaign creator is automatically the first GM");

 const outsiderList=await api("/api/campaigns","test_uninvited");
 check(outsiderList.campaigns.some(c=>c.id===campaignId),false,"outsider cannot discover a private campaign");
 const outsiderMembers=await api("/api/campaigns/"+campaignId+"/members","test_uninvited");
 check(outsiderMembers.status,403,"non-member cannot list campaign members");
 const outsiderInvite=await api("/api/campaigns/"+campaignId+"/invites","test_uninvited","POST",{kind:"player"});
 check(outsiderInvite.status,403,"non-member cannot generate invitations");

 const singlePlayer=await api("/api/campaigns/"+campaignId+"/invites","test_creator","POST",{kind:"player"});
 check(singlePlayer.status,201,"non-admin first GM creates one-use player invitation");
 check(singlePlayer.max_uses,1,"player invite is limited to one acceptance");
 const singleToken=new URL(singlePlayer.link).searchParams.get("invite");
 const joinedSingle=await api("/api/invites/accept","test_single_invitee","POST",{token:singleToken});
 check(joinedSingle.status,200,"invited single player joins the campaign");
 check(joinedSingle.is_gm,false,"single player invitation grants no GM powers");
 const singleReuse=await api("/api/invites/accept","test_uninvited","POST",{token:singleToken});
 check(singleReuse.status,400,"second user cannot reuse single-player invitation");
 const singleMemberInvite=await api("/api/campaigns/"+campaignId+"/invites","test_single_invitee","POST",{kind:"player"});
 check(singleMemberInvite.status,403,"ordinary player cannot invite other users");

 const groupInvite=await api("/api/campaigns/"+campaignId+"/invites","test_creator","POST",{kind:"group",max_uses:2});
 check(groupInvite.status,201,"campaign GM creates two-use player group invitation");
 check(groupInvite.max_uses,2,"group invitation has configured capacity");
 const groupToken=new URL(groupInvite.link).searchParams.get("invite");
 const joinedGroupA=await api("/api/invites/accept","test_group_invitee_a","POST",{token:groupToken});
 check(joinedGroupA.is_gm,false,"first group recipient receives player permissions");
 const repeatedGroup=await api("/api/invites/accept","test_group_invitee_a","POST",{token:groupToken});
 check(repeatedGroup.already_member,true,"repeat acceptance by a member does not consume another use");
 const joinedGroupB=await api("/api/invites/accept","test_group_invitee_b","POST",{token:groupToken});
 check(joinedGroupB.status,200,"second group recipient joins");
 const groupOverflow=await api("/api/invites/accept","test_group_overflow","POST",{token:groupToken});
 check(groupOverflow.status,400,"group invitation rejects excess member");
 const groupAInvite=await api("/api/campaigns/"+campaignId+"/invites","test_group_invitee_a","POST",{kind:"gm"});
 check(groupAInvite.status,403,"group-invited player still cannot issue GM invitations");

 const gmInvite=await api("/api/campaigns/"+campaignId+"/invites","test_creator","POST",{kind:"gm",max_uses:99});
 check(gmInvite.status,201,"GM creates an individual GM invitation");
 check(gmInvite.max_uses,1,"GM invite remains one-use even with group-use parameter");
 const gmToken=new URL(gmInvite.link).searchParams.get("invite");
 const joinedGM=await api("/api/invites/accept","test_gm_invitee","POST",{token:gmToken});
 check(joinedGM.is_gm,true,"GM invitation grants both GM and player membership");
 const secondGMInvite=await api("/api/campaigns/"+campaignId+"/invites","test_gm_invitee","POST",{kind:"player"});
 check(secondGMInvite.status,201,"newly appointed GM may invite another player");
 const gmReuse=await api("/api/invites/accept","test_uninvited","POST",{token:gmToken});
 check(gmReuse.status,400,"GM invitation cannot be reused");

 const upgradeInvite=await api("/api/campaigns/"+campaignId+"/invites","test_creator","POST",{kind:"gm"});
 check(upgradeInvite.status,201,"first GM can issue second GM invitation");
 const upgradeToken=new URL(upgradeInvite.link).searchParams.get("invite");
 const upgraded=await api("/api/invites/accept","test_single_invitee","POST",{token:upgradeToken});
 check(upgraded.is_gm,true,"existing player gains GM privileges without new membership");
 const after=await api("/api/campaigns/"+campaignId+"/members","test_creator");
 check(after.members.length,6,"final campaign has creator plus five joined users, no duplicates");
 check(after.members.filter(m=>m.is_gm).length,3,"campaign has three GMs and unrestricted GM count");
 const nonadminList=await api("/api/campaigns","test_single_invitee");
 check(nonadminList.campaigns.some(c=>c.id===campaignId && c.is_gm===1),true,"new GM sees their campaign in personal list");

 const outsider=await api("/api/campaigns/test_kanji/invites","test_gm_b","POST",{kind:"gm"});
 check(outsider.status,403,"GM from another campaign cannot invite");
 const single=await api("/api/campaigns/test_kanji/invites","test_gm_a","POST",{kind:"gm"});
 check(single.status,201,"GM generates single-use GM invite");
 const token=new URL(single.link).searchParams.get("invite");
 const accepted=await api("/api/invites/accept","test_player_a","POST",{token});
 check(accepted.is_gm,true,"new member promoted to GM via invite");
 const second=await api("/api/invites/accept","test_player_b","POST",{token});
 check(second.status,400,"single-use GM invite cannot be used again");
 const group=await api("/api/campaigns/test_kanji/invites","test_gm_a","POST",{kind:"group",max_uses:2});
 check(group.status,201,"GM can issue bounded group invite");
 const groupToken=new URL(group.link).searchParams.get("invite");
 const groupAccepted=await api("/api/invites/accept","test_player_b","POST",{token:groupToken});
 check(groupAccepted.status,200,"player accepts group invite");
 const before=await api("/api/admin/users","test_player_b");
 check(before.status,403,"players cannot list admins");
 const promoted=await api("/api/admin/users/test_player_b/promote","test_admin","POST",{});
 check(promoted.ok,true,"existing user promoted to server admin");
 const fromOther=await api("/api/admin/users/test_gm_b/revoke","test_creator","POST",{});
 check(fromOther.status,403,"non-administrator cannot revoke admin privileges");
 const unicode=await api("/api/campaigns","test_admin","POST",{name:"test_Þórsheimr – 霧の王国",is_test_data:true});
 check(unicode.status,201,"Unicode test campaign created");
 const remote=await fetch("http://localhost:"+port+"/api/me",{headers:{"x-dev-user":"test_admin"}});
 // Localhost is deliberately allowed; remote-host security is checked in HTTP boundary tests.
 check(remote.status,200,"localhost simulator accepts development identity");
 process.stdout.write("D1 integration: "+checks+" checks passed.\n");
}catch(error){console.error("FAIL local D1 integration:",error);process.exitCode=1;}
finally{
 if(child){
  if(win && child.pid)spawnSync("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});
  else child.kill();
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 await rm(persistence,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
