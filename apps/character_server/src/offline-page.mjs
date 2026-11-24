// Offline browser workspace for the local developer simulator.
// PRIVATE INFORMATION: IndexedDB persists in this browser profile, unencrypted.
// This is not yet a production-ready offline identity or multi-device LAN server.
export const OFFLINE_PAGE=String.raw`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reactive Offline Workspace (local alpha)</title>
<style>
:root{font:16px system-ui,sans-serif;color:#202735;background:#f5f6f8}
body{max-width:900px;margin:2rem auto;padding:0 1rem}section{background:white;border:1px solid #cbd2da;padding:1.1rem;margin:1rem 0;border-radius:9px}
label{display:block;margin:.5rem 0}button,select,textarea,input{font:inherit;padding:.4rem;max-width:100%}
textarea{box-sizing:border-box;width:100%;min-height:140px}button{cursor:pointer;margin:.3rem}
small{color:#45536a}pre{white-space:pre-wrap;overflow-wrap:anywhere} .warning{color:#7b3328} .entry{border-top:1px solid #ddd;padding:.6rem 0}
</style>
<h1>Reactive — Offline Workspace</h1>
<p>Local developer alpha. After this page is opened once while the local server is running, the cached page can reopen without a network connection. Your changes stay in this browser's IndexedDB until acknowledged by a server. <strong>Do not use this on a shared browser for private notes.</strong></p>
<p class="warning">Identity selection here is a localhost test simulator, not secure player authentication. No cross-device multiplayer or satellite-phone integration is implemented yet.</p>
<section><label>Test identity <select id="actor">
<option value="test_player_a">Player A</option><option value="test_player_b">Player B</option>
<option value="test_gm_a">GM A</option><option value="test_gm_b">GM B</option>
<option value="test_creator">Campaign Creator</option>
</select></label>
<button id="pull">Download accessible characters and notes</button>
<button id="sync">Synchronize my pending edits</button>
<button id="refresh">Refresh offline view</button>
<p id="status" role="status"></p>
</section>
<section><h2>Pending changes</h2><div id="pending"></div></section>
<section><h2>Characters and notes</h2><div id="items"></div></section>
<script>
const $=id=>document.getElementById(id);
const DB_NAME="reactive-offline-alpha-v1";
let database;
function connect(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   db.createObjectStore("records",{keyPath:"key"});
   db.createObjectStore("outbox",{keyPath:"operation_id"}).createIndex("by_actor","actor");
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
const complete=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Storage transaction aborted"));
});
const read=req=>new Promise((resolve,reject)=>{
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
const key=(actor,kind,id)=>actor+"|"+kind+"|"+id;
const actor=()=>$("actor").value;
const fixtures=record=>!!record.fixtures;
async function all(store){
 const tx=database.transaction(store,"readonly");
 return read(tx.objectStore(store).getAll());
}
async function scoped(){
 const who=actor();
 const records=(await all("records")).filter(x=>x.actor===who);
 const pending=(await all("outbox")).filter(x=>x.actor===who)
  .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.sequence-b.sequence);
 return {records,pending};
}
async function saveDownloaded(record){
 const tx=database.transaction(["records","outbox"],"readwrite");
 const rows=tx.objectStore("records"),outbox=tx.objectStore("outbox");
 const previous=await read(rows.get(record.key));
 const pending=(await read(outbox.index("by_actor").getAll(record.actor))).some(x=>x.key===record.key);
 if(!pending && (!previous || record.version>=previous.version))
  rows.put({...record,conflict:null});
 await complete(tx);
}
async function stage(kind,id,data){
 const who=actor(),resourceKey=key(who,kind,id);
 const tx=database.transaction(["records","outbox"],"readwrite");
 const records=tx.objectStore("records"),outbox=tx.objectStore("outbox");
 const record=await read(records.get(resourceKey));
 if(!record){tx.abort();throw Error("Download this resource first");}
 const queue=(await read(outbox.index("by_actor").getAll(who)))
   .filter(x=>x.key===resourceKey).sort((a,b)=>a.sequence-b.sequence);
 const expected_version=record.version+queue.length;
 const operation_id=crypto.randomUUID();
 const sequence=(record.sequence||0)+1;
 records.put({...record,data,sequence,conflict:null});
 outbox.put({operation_id,actor:who,key:resourceKey,kind,id,data,
   expected_version,fixtures:record.fixtures,created_at:new Date().toISOString(),sequence});
 await complete(tx);
 return operation_id;
}
async function ack(op,result){
 const tx=database.transaction(["records","outbox"],"readwrite");
 const records=tx.objectStore("records"),outbox=tx.objectStore("outbox");
 const record=await read(records.get(op.key));
 if(!record){tx.abort();throw Error("Missing local resource");}
 if(result.version!==op.expected_version+1){
  tx.abort();throw Error("Unexpected server revision; keeping pending operation");
 }
 records.put({...record,version:result.version,conflict:null});
 outbox.delete(op.operation_id);
 await complete(tx);
}
async function markConflict(op,message){
 const tx=database.transaction("records","readwrite"),records=tx.objectStore("records");
 const record=await read(records.get(op.key));
 if(record)records.put({...record,conflict:message});
 await complete(tx);
}
async function serverState(record){
 if(record.kind==="character"){
  const c=(await request("/api/characters/"+encodeURIComponent(record.id),"GET",undefined,
    record.fixtures,record.actor)).character;
  return {version:c.version,data:{name:c.name,character_sheet_tokens:c.character_sheet_tokens}};
 }
 const notes=(await request("/api/characters/"+encodeURIComponent(record.character_id)+"/notes",
   "GET",undefined,record.fixtures,record.actor)).notes;
 const n=notes.find(n=>n.id===record.id);
 if(!n)throw Error("Note no longer accessible");
 return {version:n.version,data:{body:n.body}};
}
async function resolveConflict(record){
 const remote=await serverState(record);
 const pending=(await all("outbox")).filter(op=>op.key===record.key);
 if(!pending.length){message("No pending operations for this resource.");return;}
 // Present both complete states for a conscious human decision. Never silently
 // overwrite the server or discard local work.
 const localJson=JSON.stringify(record.data,null,2);
 const remoteJson=JSON.stringify(remote.data,null,2);
 const proposal="REMOTE revision "+remote.version+":\n"+remoteJson+
   "\n\nLOCAL pending changes:\n"+localJson+
   "\n\nOK: rebase LOCAL final state as one new pending update on current remote revision.\n"+
   "Cancel: preserve all pending edits unchanged.";
 if(!confirm(proposal))return;
 const tx=database.transaction(["records","outbox"],"readwrite");
 const records=tx.objectStore("records"),outbox=tx.objectStore("outbox");
 for(const op of pending)outbox.delete(op.operation_id);
 const nextSequence=(record.sequence||0)+1;
 const operation_id=crypto.randomUUID();
 outbox.put({operation_id,actor:record.actor,key:record.key,
  kind:record.kind,id:record.id,data:record.data,fixtures:record.fixtures,
  expected_version:remote.version,created_at:new Date().toISOString(),sequence:nextSequence});
 records.put({...record,version:remote.version,sequence:nextSequence,conflict:null});
 await complete(tx);
 message("Rebased local changes. They are still pending until explicitly synchronized.");
 await render();
}
async function request(path,method="GET",body,fixture=false,who=actor()){
 const res=await fetch(path,{method,headers:{
  "x-dev-user":who,"x-dev-fixtures":fixture?"1":"0",
  ...(body===undefined?{}:{"content-type":"application/json"})
 },body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
 const data=await res.json();
 if(!res.ok){const e=new Error(data.error||"Server returned "+res.status);e.status=res.status;e.data=data;throw e;}
 return data;
}
async function pull(){
 const who=actor();
 const characters=await request("/api/characters");
 let count=0;
 for(const item of characters.characters){
  const c=(await request("/api/characters/"+encodeURIComponent(item.id),"GET",undefined,!!item.is_test_data)).character;
  await saveDownloaded({key:key(who,"character",c.id),actor:who,kind:"character",id:c.id,
   version:c.version,fixtures:!!item.is_test_data,sequence:0,
   editable:c.players.includes(who)||(!c.players.length && c.uploaded_by===who),
   data:{name:c.name,character_sheet_tokens:c.character_sheet_tokens}});
  const notes=(await request("/api/characters/"+encodeURIComponent(c.id)+"/notes","GET",undefined,!!item.is_test_data)).notes;
  for(const n of notes){
   await saveDownloaded({key:key(who,"note",n.id),actor:who,kind:"note",id:n.id,
    character_id:c.id,version:n.version,fixtures:!!item.is_test_data,sequence:0,
    editable:n.author_id===who,visibility:n.visibility,data:{body:n.body}});
  }
  count++;
 }
 message("Downloaded "+count+" characters and accessible notes. Pending local edits were preserved.");
 await render();
}
async function sync(){
 let success=0;
 const {pending}=await scoped();
 const blocked=new Set();
 for(const op of pending){
  if(blocked.has(op.key))continue;
  const r=(await all("records")).find(x=>x.key===op.key);
  if(!r){blocked.add(op.key);continue;}
  const path=op.kind==="character"?"/api/characters/"+encodeURIComponent(op.id)+"/sync":
    "/api/notes/"+encodeURIComponent(op.id)+"/sync";
  try{
   const result=await request(path,"POST",{
    operation_id:op.operation_id,expected_version:op.expected_version,...op.data
   },op.fixtures,op.actor);
   await ack(op,result);success++;
  }catch(error){
   blocked.add(op.key);
   await markConflict(op,error.status===409?
    "Version conflict. Local changes preserved; resolve manually before retrying.":
    "Not acknowledged: "+error.message);
  }
 }
 message("Acknowledged "+success+" change(s). Unacknowledged changes remain stored locally.");
 await render();
}
function message(s){$("status").textContent=s;}
const txt=(parent,tag,value)=>{
 const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;
};
async function render(){
 const {records,pending}=await scoped();
 $("pending").replaceChildren();
 if(!pending.length)txt($("pending"),"p","No pending edits for this identity.");
 for(const op of pending){
  const row=txt($("pending"),"div",op.kind+" "+op.id+" · based on version "+op.expected_version+" · "+op.operation_id);
  row.className="entry";
 }
 $("items").replaceChildren();
 for(const record of records.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))){
  const box=document.createElement("div");box.className="entry";
  txt(box,"strong",record.kind+" · "+record.id);
  txt(box,"p","Last acknowledged server revision: "+record.version+
   " · pending: "+pending.filter(x=>x.key===record.key).length+
   (record.editable?" · editable":" · read-only"));
  if(record.conflict)txt(box,"p",record.conflict).className="warning";
  if(record.conflict && record.editable){
   const resolve=txt(box,"button","Review conflict and rebase");
   resolve.addEventListener("click",()=>run(()=>resolveConflict(record)));
  }
  const label=txt(box,"label",record.kind==="character"?"Character sheet JSON":"Note text");
  const input=document.createElement("textarea");input.disabled=!record.editable;
  input.value=record.kind==="character"?
   JSON.stringify(record.data,null,2):record.data.body;
  label.append(input);
  if(record.editable){
   const button=txt(box,"button","Save locally (queue for sync)");
   button.addEventListener("click",()=>run(async()=>{
    let value;
    if(record.kind==="character"){
     value=JSON.parse(input.value);
     if(!value || typeof value!=="object"||Array.isArray(value)||
        typeof value.name!=="string"||!value.character_sheet_tokens||
        typeof value.character_sheet_tokens!=="object"||Array.isArray(value.character_sheet_tokens))
        throw Error("Expected {name, character_sheet_tokens} JSON");
    }else value={body:input.value};
    await stage(record.kind,record.id,value);
    message("Saved locally. Server synchronization still pending.");
    await render();
   }));
  }
  $("items").append(box);
 }
}
async function run(fn){try{await fn()}catch(error){message("Error: "+error.message);}}
$("actor").addEventListener("change",()=>run(render));
$("pull").addEventListener("click",()=>run(pull));
$("sync").addEventListener("click",()=>run(sync));
$("refresh").addEventListener("click",()=>run(render));
run(async()=>{
 database=await connect();await render();
 if("serviceWorker" in navigator){
  try{await navigator.serviceWorker.register("/offline-sw.js",{scope:"/"});}
  catch(e){message("Offline cache unavailable: "+e.message);}
 }
});
</script></html>`;
export const OFFLINE_SW=String.raw`const CACHE="reactive-offline-shell-v1";
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(["/offline","/offline-sw.js"])));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET" || new URL(request.url).pathname!=="/offline")return;
 event.respondWith(fetch(request).catch(()=>caches.match("/offline")));
});`;
