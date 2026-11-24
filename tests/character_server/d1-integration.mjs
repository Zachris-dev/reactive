// End-to-end local D1 test. Creates temporary Wrangler persistence outside real dev data.
// Requires npm install in apps/character_server. NEVER uses a remote D1 database.
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {encodeMessage,decodeMessage} from "../../packages/communications/protocol.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../apps/character_server");
const config="wrangler.local.jsonc", database="reactive-character-server-local";
const cli=process.platform==="win32"?"npx.cmd":"npx", win=process.platform==="win32";
const port=8799,base="http://127.0.0.1:"+port;
let child,output="",checks=0;
async function stopWorker(){
 if(!child)return;
 const prior=child;
 if(win && prior.pid)spawnSync("taskkill",["/PID",String(prior.pid),"/T","/F"],{stdio:"ignore"});
 else prior.kill();
 child=null;
 await new Promise(resolve=>setTimeout(resolve,500));
}
function startWorker(){
 output="";
 child=spawn(cli,["wrangler","dev","--local","--ip","127.0.0.1","--port",String(port),
  "--persist-to",persistence,"--config",config],{cwd:root,shell:win,stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",x=>{output+=String(x).slice(-3000)});
 child.stderr.on("data",x=>{output+=String(x).slice(-3000)});
}
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
async function protocolApi(type,payload,actor,requestId=17){
 const frame=encodeMessage(type,payload,requestId);
 const res=await fetch(base+"/api/protocol",{method:"POST",headers:{
  "content-type":"application/octet-stream","x-dev-user":actor
 },body:frame});
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(res.headers.get("content-type")?.startsWith("application/octet-stream")){
  const reply=decodeMessage(bytes,"response");
  assert.equal(reply.requestId,requestId,"request/response ID matches");
  return {status:res.status,...reply.payload.data};
 }
 return {status:res.status,raw:new TextDecoder().decode(bytes)};
}
async function invalidProtocol(frame,actor="test_creator"){
 const res=await fetch(base+"/api/protocol",{method:"POST",headers:{
  "content-type":"application/octet-stream","x-dev-user":actor
 },body:frame});
 return res.status;
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
 startWorker();
 await ready();
 const gmCampaigns=await api("/api/campaigns","test_gm_a","GET",undefined,false);
 check(gmCampaigns.campaigns.length,0,"test campaigns hidden in normal member view");
 const all=await api("/api/campaigns?admin=1","test_admin","GET",undefined,false);
 check(all.campaigns.length,0,"test campaigns hidden in normal admin view");
 const dev=await api("/api/campaigns?admin=1","test_admin","GET",undefined,true);
 // explicit fixture view is enabled above; check the fixtures are present.
 check(dev.campaigns.length,3,"developer fixtures loaded");
 // Binary protocol uses the same session and authorization as existing routes.
 const framedMine=await protocolApi("campaign.mine",{},"test_player_a");
 check(framedMine.campaigns.some(c=>c.id==="test_viking"),true,"binary protocol lists current player's campaigns");
 const framedChars=await protocolApi("character.list-all",{},"test_player_a");
 check(framedChars.characters.some(c=>c.id==="test_shared_hero"),true,"binary protocol lists assigned characters");
 const framedUnauthorized=await protocolApi("admin.users",{},"test_player_a");
 check(framedUnauthorized.status,403,"binary request cannot bypass administrator permissions");
 const badLength=encodeMessage("campaign.mine",{},33);
 new DataView(badLength.buffer).setUint32(11,99);
 check(await invalidProtocol(badLength),400,"binary protocol rejects too-long declared payload");
 const extraBytes=Uint8Array.from([...encodeMessage("campaign.mine",{},34),0]);
 check(await invalidProtocol(extraBytes),400,"binary protocol rejects extra bytes");
 const badType=encodeMessage("campaign.mine",{},35);
 new DataView(badType.buffer).setUint16(5,65535);
 check(await invalidProtocol(badType),400,"binary protocol rejects unknown message types");
 const normalAfterAttack=await protocolApi("campaign.mine",{},"test_player_a");
 check(normalAfterAttack.campaigns.length,2,"malformed protocol requests do not damage legitimate session");

 // Offline retries, player ownership and conflicts use real D1 transactions.
 const op1="f1000000-0000-4000-8000-000000000001";
 const op2="f1000000-0000-4000-8000-000000000002";
 const op3="f1000000-0000-4000-8000-000000000003";
 const playerUpdate=await protocolApi("character.replace",{
  character_id:"test_shared_hero",fixtures:true,operation_id:op1,expected_version:1,
  name:"test_Shared Wanderer",character_sheet_tokens:{skill:"4.5",role:"shared PC"}
 },"test_player_a");
 check(playerUpdate.status,200,"assigned player synchronizes sheet through protocol");
 check(playerUpdate.version,2,"character revision increases");
 const retry=await protocolApi("character.replace",{
  character_id:"test_shared_hero",fixtures:true,operation_id:op1,expected_version:1,
  name:"test_Shared Wanderer",character_sheet_tokens:{skill:"4.5",role:"shared PC"}
 },"test_player_a");
 check(retry.already_applied,true,"lost acknowledgement retry is idempotent");
 const modifiedReplay=await protocolApi("character.replace",{
  character_id:"test_shared_hero",fixtures:true,operation_id:op1,expected_version:1,
  name:"Modified replay",character_sheet_tokens:{skill:"0.0"}
 },"test_player_a");
 check(modifiedReplay.status,409,"reusing an operation ID with different content is rejected");
 const stale=await protocolApi("character.replace",{
  character_id:"test_shared_hero",fixtures:true,operation_id:op2,expected_version:1,
  name:"Outdated",character_sheet_tokens:{skill:"0.1"}
 },"test_player_b");
 check(stale.status,409,"second player offline conflict returns 409");
 check(stale.current_version,2,"conflict returns server revision");
 const gmOverwrite=await protocolApi("character.replace",{
  character_id:"test_shared_hero",fixtures:true,operation_id:op3,expected_version:2,
  name:"GM overwrite",character_sheet_tokens:{}
 },"test_gm_a");
 check(gmOverwrite.status,403,"GM cannot synchronize assigned player sheet");
 const outsiderOverwrite=await protocolApi("character.replace",{
  character_id:"test_shared_hero",fixtures:true,operation_id:op3,expected_version:2,
  name:"Outsider overwrite",character_sheet_tokens:{}
 },"test_uninvited");
 check(outsiderOverwrite.status,403,"outsider cannot change character");
 const revisions=await protocolApi("character.revisions",{
  character_id:"test_shared_hero",fixtures:true
 },"test_player_a");
 check(revisions.revisions.length,2,"character history retains original and current versions");
 check(revisions.revisions[0].character_sheet_tokens.skill,"3.5","original character sheet not lost");
 const pnoteOp="f2000000-0000-4000-8000-000000000001";
 const privateSync=await protocolApi("note.replace",{
  note_id:"test_private_a",fixtures:true,operation_id:pnoteOp,
  expected_version:1,body:"Updated private Unicode entry: ä 😀"
 },"test_player_a");
 check(privateSync.version,2,"author may synchronize private note");
 const privateRetry=await protocolApi("note.replace",{
  note_id:"test_private_a",fixtures:true,operation_id:pnoteOp,
  expected_version:1,body:"Updated private Unicode entry: ä 😀"
 },"test_player_a");
 check(privateRetry.already_applied,true,"private note retry is idempotent");
 const otherNote=await protocolApi("note.replace",{
  note_id:"test_private_a",fixtures:true,
  operation_id:"f2000000-0000-4000-8000-000000000002",
  expected_version:2,body:"stolen"
 },"test_player_b");
 check(otherNote.status,403,"other assigned player cannot synchronize private note");
 const gmPrivateHistory=await protocolApi("note.revisions",{
  note_id:"test_private_a",fixtures:true
 },"test_gm_a");
 check(gmPrivateHistory.status,403,"GM cannot read private note history");
 const noteHistory=await protocolApi("note.revisions",{
  note_id:"test_private_a",fixtures:true
 },"test_player_a");
 check(noteHistory.revisions[0].body,"Private clue for player A only.","private note history retains original text");
 const afterRejected=await protocolApi("character.read",{
  character_id:"test_shared_hero",fixtures:true
 },"test_player_a");
 check(afterRejected.character.character_sheet_tokens.skill,"4.5","rejected conflicts never overwrite current data");

 const seededShared=await api("/api/characters/test_shared_hero","test_player_a");
 check(seededShared.status,200,"seeded shared character is accessible to assigned player");
 check(seededShared.character.players.length,2,"seeded shared character has two assigned players");
 const playerACampaigns=await api("/api/my-campaigns","test_player_a","GET",undefined,false);
 check(playerACampaigns.campaigns.length,2,"player A can select both of their campaigns regardless of list filter");
 check(playerACampaigns.campaigns.some(c=>c.id==="test_viking"),true,"campaign selector includes Viking Saga");
 check(playerACampaigns.campaigns.some(c=>c.id==="test_eldrich"),true,"campaign selector includes The Eldrich Race");
 const playerAAllChars=await api("/api/characters","test_player_a","GET",undefined,false);
 check(playerAAllChars.characters.some(c=>c.id==="test_hero_a"),true,"no campaign selection loads first accessible character");
 check(playerAAllChars.characters.some(c=>c.id==="test_shared_hero"),true,"no campaign selection loads shared character");
 check(playerAAllChars.characters.some(c=>c.id==="test_npc"),false,"all-campaign listing excludes unassigned GM character");
 check(playerAAllChars.characters.every(c=>!!c.campaign_name),true,"cross-campaign character rows identify campaign");
 const outsiderAll=await api("/api/characters","test_uninvited","GET",undefined,true);
 check(outsiderAll.characters.length,0,"uninvited user sees no cross-campaign characters");
 const adminAll=await api("/api/characters","test_admin","GET",undefined,true);
 check(adminAll.characters.length,0,"server administrator cannot inspect cross-campaign character contents");
 const seededBNotes=await api("/api/characters/test_shared_hero/notes","test_player_b");
 check(seededBNotes.notes.some(n=>n.id==="test_shared_note"),true,"seeded shared note visible to second player");
 check(seededBNotes.notes.some(n=>n.id==="test_private_a"),false,"seeded player A private note hidden from player B");
 const seededGmNotes=await api("/api/characters/test_shared_hero/notes","test_gm_a");
 check(seededGmNotes.notes.some(n=>n.id==="test_private_a"),false,"seeded player private note hidden from GM");
 const createdNormal=await api("/api/campaigns","test_admin","POST",{name:"The Eldrich Race",is_test_data:false},false);
 check(createdNormal.status,201,"ordinary campaign creation succeeds");
 const normalWithPrefix=await api("/api/campaigns","test_creator","POST",{name:"test_Actually Normal",is_test_data:false},false);
 check(normalWithPrefix.status,201,"normal campaign can contain test_ in its display name");
 const normalInvite=await api("/api/campaigns/"+normalWithPrefix.id+"/invites","test_creator","POST",{kind:"player"},false);
 check(normalInvite.status,201,"ordinary campaign invitation is created before test reset");
 const normalInviteToken=new URL(normalInvite.link).searchParams.get("invite");
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
 const framedCreate=await protocolApi("character.upload",
  {campaign_id:creatorCampaign.id,name:"Protocol Hero",character_sheet_tokens:{skill:"3.3"}},"test_creator");
 check(framedCreate.status,201,"binary protocol creates character through same GM permission checks");
 const framedRead=await protocolApi("character.read",
  {character_id:framedCreate.id,fixtures:true},"test_creator");
 check(framedRead.character.character_sheet_tokens.skill,"3.3","binary protocol reads character tokens");
 const framedOutsider=await protocolApi("character.read",
  {character_id:framedCreate.id,fixtures:true},"test_uninvited");
 check(framedOutsider.status,403,"binary protocol denies third-party character access");
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
 const walkthroughGroupToken=new URL(groupInvite.link).searchParams.get("invite");
 const joinedGroupA=await api("/api/invites/accept","test_group_invitee_a","POST",{token:walkthroughGroupToken});
 check(joinedGroupA.is_gm,false,"first group recipient receives player permissions");
 const repeatedGroup=await api("/api/invites/accept","test_group_invitee_a","POST",{token:walkthroughGroupToken});
 check(repeatedGroup.already_member,true,"repeat acceptance by a member does not consume another use");
 const joinedGroupB=await api("/api/invites/accept","test_group_invitee_b","POST",{token:walkthroughGroupToken});
 check(joinedGroupB.status,200,"second group recipient joins");
 const groupOverflow=await api("/api/invites/accept","test_group_overflow","POST",{token:walkthroughGroupToken});
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
 check(after.members.length,5,"final campaign has creator plus four joined users, no duplicates");
 check(after.members.filter(m=>m.is_gm).length,3,"campaign has three GMs and unrestricted GM count");
 const nonadminList=await api("/api/campaigns","test_single_invitee");
 check(nonadminList.campaigns.some(c=>c.id===campaignId && c.is_gm===1),true,"new GM sees their campaign in personal list");

 // Character ownership: a player uploads multiple characters, while GMs
 // can create an unassigned character then share it among different players.
 const one=await api("/api/campaigns/"+campaignId+"/characters","test_group_invitee_a","POST",
  {name:"First hero",character_sheet_tokens:{skill:"4.3",inventory:["rope"]}});
 check(one.status,201,"ordinary player uploads a character");
 check(one.players.includes("test_group_invitee_a"),true,"player uploader is assigned automatically");
 const two=await api("/api/campaigns/"+campaignId+"/characters","test_group_invitee_a","POST",
  {name:"Second hero",character_sheet_tokens:{skill:"5.1"}});
 check(two.status,201,"player may upload more than one character");
 const playerCharacters=await api("/api/campaigns/"+campaignId+"/characters","test_group_invitee_a");
 check(playerCharacters.characters.some(c=>c.id===one.id),true,"player sees first uploaded character");
 check(playerCharacters.characters.some(c=>c.id===two.id),true,"player sees second uploaded character");
 const foreignCharacter=await api("/api/characters/"+one.id,"test_group_invitee_b");
 check(foreignCharacter.status,403,"unassigned member cannot read other player's character");
 const foreignListing=await api("/api/campaigns/"+campaignId+"/characters","test_group_invitee_b");
 check(foreignListing.characters.some(c=>c.id===one.id),false,"unassigned member cannot discover another character");
 const shareUploaded=await api("/api/characters/"+one.id+"/assign","test_creator","POST",{user_id:"test_group_invitee_b"});
 check(shareUploaded.players.length,2,"GM can add a player to a character already assigned to its uploader");
 const nowShared=await api("/api/characters/"+one.id,"test_group_invitee_b");
 check(nowShared.status,200,"second assigned player now accesses existing player-uploaded character");
 const nonGMAdmin=await api("/api/characters/"+one.id,"test_admin");
 check(nonGMAdmin.status,403,"server administrator cannot read characters without campaign access");
 const gmCharacter=await api("/api/campaigns/"+campaignId+"/characters","test_creator","POST",
  {name:"Shared hero",character_sheet_tokens:{race:"High Emeri"}});
 check(gmCharacter.status,201,"GM may upload character");
 check(gmCharacter.players.length,0,"GM-uploaded character initially unassigned");
 const assignA=await api("/api/characters/"+gmCharacter.id+"/assign","test_creator","POST",{user_id:"test_group_invitee_a"});
 check(assignA.players.includes("test_group_invitee_a"),true,"GM assigns first player");
 const assignB=await api("/api/characters/"+gmCharacter.id+"/assign","test_creator","POST",{user_id:"test_group_invitee_b"});
 check(assignB.players.length,2,"GM adds second player to already-assigned character");
 const assignAgain=await api("/api/characters/"+gmCharacter.id+"/assign","test_creator","POST",{user_id:"test_group_invitee_b"});
 check(assignAgain.players.length,2,"reassigning same player does not duplicate assignment");
 const playerAssignmentAttempt=await api("/api/characters/"+gmCharacter.id+"/assign","test_group_invitee_a","POST",{user_id:"test_uninvited"});
 check(playerAssignmentAttempt.status,403,"players cannot assign characters to other users");
 const outsiderAssignmentAttempt=await api("/api/characters/"+gmCharacter.id+"/assign","test_creator","POST",{user_id:"test_uninvited"});
 check(outsiderAssignmentAttempt.status,400,"GM cannot assign characters to non-members");

 const privateNote=await api("/api/characters/"+gmCharacter.id+"/notes","test_group_invitee_a","POST",
  {visibility:"private",body:"Only player A knows"});
 check(privateNote.status,201,"assigned player creates private note");
 const sharedNote=await api("/api/characters/"+gmCharacter.id+"/notes","test_group_invitee_a","POST",
  {visibility:"shared",body:"Both players and GM know"});
 check(sharedNote.status,201,"assigned player creates shared note");
 const gmPrivate=await api("/api/characters/"+gmCharacter.id+"/notes","test_creator","POST",
  {visibility:"private",body:"GM private clue"});
 check(gmPrivate.status,201,"GM can also keep personal notes");
 const privateB=await api("/api/characters/"+gmCharacter.id+"/notes","test_group_invitee_b","POST",
  {visibility:"private",body:"Player B secret"});
 check(privateB.status,201,"second player keeps their own private note");
 const notesA=await api("/api/characters/"+gmCharacter.id+"/notes","test_group_invitee_a");
 check(notesA.notes.some(n=>n.id===privateNote.id),true,"player A sees their own private note");
 check(notesA.notes.some(n=>n.id===sharedNote.id),true,"player A sees shared note");
 check(notesA.notes.some(n=>n.id===privateB.id),false,"player A cannot see player B private note");
 check(notesA.notes.some(n=>n.id===gmPrivate.id),false,"player A cannot see GM private note");
 const notesB=await api("/api/characters/"+gmCharacter.id+"/notes","test_group_invitee_b");
 check(notesB.notes.some(n=>n.id===sharedNote.id),true,"player B sees player A shared note");
 check(notesB.notes.some(n=>n.id===privateNote.id),false,"player B cannot see player A private note");
 const notesGM=await api("/api/characters/"+gmCharacter.id+"/notes","test_creator");
 check(notesGM.notes.some(n=>n.id===sharedNote.id),true,"GM sees shared note");
 check(notesGM.notes.some(n=>n.id===privateNote.id),false,"GM cannot see player private note");
 check(notesGM.notes.some(n=>n.id===gmPrivate.id),true,"GM sees only their own private note");
 const notesOutsider=await api("/api/characters/"+gmCharacter.id+"/notes","test_uninvited");
 check(notesOutsider.status,403,"outsider cannot access any character notes");
 const nonMemberCharacter=await api("/api/campaigns/"+campaignId+"/characters","test_uninvited");
 check(nonMemberCharacter.status,403,"outsider cannot list characters");
 const charDetailsB=await api("/api/characters/"+gmCharacter.id,"test_group_invitee_b");
 check(charDetailsB.character.players.length,2,"shared character lists both assigned players");
 check(charDetailsB.character.character_sheet_tokens.race,"High Emeri","placeholder sheet tokens round-trip");

 // Normal campaign character must survive developer reset.
 const normalCharacter=await api("/api/campaigns/"+normalWithPrefix.id+"/characters","test_creator","POST",
  {name:"Keep me",character_sheet_tokens:{test:true}},false);
 check(normalCharacter.status,201,"normal campaign character uploaded");
 const mixedCampaigns=await api("/api/my-campaigns","test_creator","GET",undefined,true);
 check(mixedCampaigns.campaigns.some(c=>c.id===campaignId),true,"user sees test campaign in selector");
 check(mixedCampaigns.campaigns.some(c=>c.id===normalWithPrefix.id),true,"user sees normal campaign in same selector");
 const mixedCharacters=await api("/api/characters","test_creator","GET",undefined,true);
 check(mixedCharacters.characters.some(c=>c.id===normalCharacter.id),true,"all-campaign list includes normal character");
 check(mixedCharacters.characters.some(c=>c.id===gmCharacter.id),true,"all-campaign list includes test character");
 check(mixedCharacters.characters.find(c=>c.id===normalCharacter.id).is_test_data,0,"normal character type identified for detail requests");
 check(mixedCharacters.characters.find(c=>c.id===gmCharacter.id).is_test_data,1,"test character type identified for detail requests");
 const normalNote=await api("/api/characters/"+normalCharacter.id+"/notes","test_creator","POST",
  {visibility:"private",body:"Normal campaign stays intact"},false);
 check(normalNote.status,201,"normal campaign private note uploaded");

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
 // Verify selective reset against the same isolated D1 persistence.
 // The Worker is stopped before D1 is modified; production data is impossible
 // to access because the test uses a newly created temporary persistence path.
 await stopWorker();
 command(["d1","execute",database,...common,"--file","fixtures/reset.sql","--yes"]);
 command(["d1","execute",database,...common,"--file","fixtures/seed.sql","--yes"]);
 startWorker();
 await ready();
 const normalAfterReset=await api("/api/campaigns","test_admin","GET",undefined,false);
 check(normalAfterReset.campaigns.some(c=>c.id===createdNormal.id),true,"reset preserves the ordinary campaign");
 const normalCreatorAfterReset=await api("/api/campaigns","test_creator","GET",undefined,false);
 check(normalCreatorAfterReset.campaigns.some(c=>c.id===normalWithPrefix.id),true,"reset preserves normal campaign even with test_ prefix");
 const normalInviteAfterReset=await api("/api/invites/accept","test_uninvited","POST",{token:normalInviteToken},false);
 check(normalInviteAfterReset.status,200,"normal campaign invitation remains valid after test reset");
 const normalCharAfter=await api("/api/characters/"+normalCharacter.id,"test_creator","GET",undefined,false);
 check(normalCharAfter.status,200,"reset preserves normal character");
 const normalNotesAfter=await api("/api/characters/"+normalCharacter.id+"/notes","test_creator","GET",undefined,false);
 check(normalNotesAfter.notes.some(n=>n.id===normalNote.id),true,"reset preserves normal private notes");
 const removedChar=await api("/api/characters/"+gmCharacter.id,"test_creator");
 check(removedChar.status,404,"reset deletes test-campaign characters");
 const baselineAfterReset=await api("/api/campaigns?admin=1","test_admin");
 check(baselineAfterReset.campaigns.length,3,"reset leaves exactly three seeded test campaigns");
 check(baselineAfterReset.campaigns.some(c=>c.id===createdTest.id),false,"reset removes ad-hoc test campaign");
 check(baselineAfterReset.campaigns.some(c=>c.id===creatorCampaign.id),false,"reset removes non-admin-created test campaign");
 const restoredMembers=await api("/api/campaigns/test_kanji/members","test_gm_a");
 check(restoredMembers.members.length,1,"reset restores original test campaign membership");
 check(restoredMembers.members[0].id,"test_gm_a","original seeded GM remains");
 const restoredUsers=await api("/api/admin/users","test_admin");
 check(restoredUsers.users.find(u=>u.id==="test_player_b").is_admin,0,"reset undoes test administrator promotion");
 check(restoredUsers.users.find(u=>u.id==="test_creator").is_admin,0,"non-admin test creator remains non-admin");
 const postResetCreator=await api("/api/campaigns","test_creator");
 check(postResetCreator.campaigns.some(c=>c.id===creatorCampaign.id),false,"non-admin creator no longer belongs to removed test campaign");
 const reseeded=await api("/api/campaigns","test_gm_a");
 check(reseeded.campaigns.some(c=>c.id==="test_viking"),true,"baseline campaign remains usable");
 const restoredShared=await api("/api/characters/test_shared_hero","test_player_a");
 check(restoredShared.status,200,"selective reset restores baseline shared character");
 check(restoredShared.character.players.length,2,"reset restores shared character assignments");
 const restoredPrivate=await api("/api/characters/test_shared_hero/notes","test_player_b");
 check(restoredPrivate.notes.some(n=>n.id==="test_private_a"),false,"reset keeps player A private notes hidden from player B");

 process.stdout.write("D1 integration: "+checks+" checks passed.\n");
}catch(error){console.error("FAIL local D1 integration:",error);process.exitCode=1;}
finally{
 await stopWorker();
 await rm(persistence,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
