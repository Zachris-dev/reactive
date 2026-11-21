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
 const fromOther=await api("/api/admin/users/test_gm_b/revoke","test_player_b","POST",{});
 check(fromOther.status,403,"non-administrator cannot be revoked as admin");
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
