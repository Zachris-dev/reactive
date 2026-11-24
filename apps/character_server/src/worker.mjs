import { canManageCampaign, canRecoverCampaignGM, canRevokeAdministrator,
  invitationSpec, invitationValid, normalizeCampaignName } from "./policy.mjs";
import { PAGE } from "./page.mjs";
import {OFFLINE_PAGE,OFFLINE_SW} from "./offline-page.mjs";
import {decodeMessage,encodeMessage,ProtocolError,HEADER_SIZE,MAX_PAYLOAD} from "../../../packages/communications/protocol.mjs";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const fail = (status, message) => json({error: message}, status);
const uuid = () => crypto.randomUUID();
const iso = (now) => new Date(now).toISOString();
const dbRow = async (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const dbAll = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const dbRun = async (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const count = async (db, sql, ...args) => Number((await dbRow(db, sql, ...args))?.n ?? 0);

async function audit(db, actor, action, target, details = {}) {
  await dbRun(db, "INSERT INTO audit_events(id,actor_id,action,target_id,details_json) VALUES(?,?,?,?,?)",
    uuid(), actor, action, target, JSON.stringify(details));
}

async function tokenDigest(token) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2,"0")).join("");
}

function localDevelopment(req, env) {
  const url = new URL(req.url);
  return env.DEV_AUTH === "local-only" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

async function actorFor(req, env, now) {
  // There is deliberately NO public authentication implementation in this alpha.
  // Remote deployments cannot use x-dev-user, even if misconfigured with DEV_AUTH.
  if (!localDevelopment(req, env)) return null;
  const id = req.headers.get("x-dev-user");
  if (!id?.startsWith("test_")) return null;
  const actor = await dbRow(env.DB, "SELECT * FROM users WHERE id=? AND is_test_data=1", id);
  if (actor && req.headers.get("x-dev-freeze-activity") !== "1")
    await dbRun(env.DB,"UPDATE users SET last_active_at=? WHERE id=?",iso(now),actor.id);
  return actor;
}

// Limit placeholder payloads until the shared character-sheet serializer is integrated.
function characterName(value) {
  if (typeof value !== "string" || !value.trim() || Array.from(value.trim()).length > 100)
    throw new Error("Character name must contain 1–100 characters");
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Character name cannot contain control characters");
  return value.trim().normalize("NFC");
}
function characterTokens(value) {
  if (value === undefined) return "{}";
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Character sheet tokens must be a JSON object");
  const encoded=JSON.stringify(value);
  if (encoded.length > 8000) throw new Error("Character sheet tokens exceed 8000 characters");
  return encoded;
}
function noteText(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4000)
    throw new Error("Note text must contain 1–4000 characters");
  return value;
}
async function syncHash(value) {
 const data=new TextEncoder().encode(JSON.stringify(value));
 const digest=await crypto.subtle.digest("SHA-256",data);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
function validSyncInput(input) {
 return input && typeof input.operation_id==="string" &&
   /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operation_id) &&
   Number.isSafeInteger(input.expected_version) && input.expected_version>=1;
}
function noteSyncText(value) {
 if(typeof value!=="string"||value.length>4000)throw new Error("Note text exceeds 4000 characters");
 // Unlike original note creation, a replacement may legitimately be empty.
 return value;
}
async function characterAccess(db, id, actor, fixtures) {
  const ch=await dbRow(db, "SELECT c.*,ca.is_test_data FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id WHERE c.id=?",id);
  if (!ch || (!!ch.is_test_data)!==fixtures) return null;
  const membership=await dbRow(db,"SELECT is_gm FROM memberships WHERE campaign_id=? AND user_id=?",ch.campaign_id,actor.id);
  if (!membership) return {ch,membership:null,assigned:false,allowed:false};
  const assigned=!!(await dbRow(db,"SELECT user_id FROM character_players WHERE character_id=? AND user_id=?",id,actor.id));
  return {ch,membership,assigned,allowed:!!membership.is_gm || assigned};
}
const publicCharacter = (ch, players) => ({
 id:ch.id,campaign_id:ch.campaign_id,name:ch.name,
 character_sheet_tokens:JSON.parse(ch.character_sheet_tokens),
 uploaded_by:ch.uploaded_by,version:ch.version,players
});

async function body(req) {
  const text = await req.text();
  if (text.length > 10000) throw new Error("Request too large");
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object");
  return parsed;
}

// The binary endpoint shares the exact legacy handlers and their database
// permission checks. This adapter is temporary while the browser UI migrates.
function protocolTarget(type,p) {
 const id=value=>encodeURIComponent(value);
 const fixture=!!p.fixtures;
 switch(type){
  case "campaign.list":return {path:"/api/campaigns"+(p.admin?"?admin=1":""),method:"GET",fixture};
  case "campaign.mine":return {path:"/api/my-campaigns",method:"GET"};
  case "campaign.create":return {path:"/api/campaigns",method:"POST",data:{name:p.name,is_test_data:!!p.is_test_data},fixture:!!p.is_test_data};
  case "campaign.members":return {path:"/api/campaigns/"+id(p.campaign_id)+"/members",method:"GET",fixture};
  case "invitation.create":return {path:"/api/campaigns/"+id(p.campaign_id)+"/invites",method:"POST",data:{kind:p.kind,expires_days:p.expires_days??7,max_uses:p.max_uses??10},fixture};
  case "invitation.accept":return {path:"/api/invites/accept",method:"POST",data:{token:p.token},fixture};
  case "character.list":return {path:"/api/campaigns/"+id(p.campaign_id)+"/characters",method:"GET",fixture};
  case "character.list-all":return {path:"/api/characters",method:"GET"};
  case "character.upload":return {path:"/api/campaigns/"+id(p.campaign_id)+"/characters",method:"POST",data:{name:p.name,character_sheet_tokens:p.character_sheet_tokens},fixture};
  case "character.read":return {path:"/api/characters/"+id(p.character_id),method:"GET",fixture};
  case "character.replace":return {path:"/api/characters/"+id(p.character_id)+"/sync",method:"POST",data:{operation_id:p.operation_id,expected_version:p.expected_version,name:p.name,character_sheet_tokens:p.character_sheet_tokens},fixture};
  case "character.revisions":return {path:"/api/characters/"+id(p.character_id)+"/revisions",method:"GET",fixture};
  case "note.replace":return {path:"/api/notes/"+id(p.note_id)+"/sync",method:"POST",data:{operation_id:p.operation_id,expected_version:p.expected_version,body:p.body},fixture};
  case "note.revisions":return {path:"/api/notes/"+id(p.note_id)+"/revisions",method:"GET",fixture};
  case "character.assign":return {path:"/api/characters/"+id(p.character_id)+"/assign",method:"POST",data:{user_id:p.user_id},fixture};
  case "note.list":return {path:"/api/characters/"+id(p.character_id)+"/notes",method:"GET",fixture};
  case "note.create":return {path:"/api/characters/"+id(p.character_id)+"/notes",method:"POST",data:{visibility:p.visibility,body:p.body},fixture};
  case "account.me":return {path:"/api/me",method:"GET"};
  case "admin.users":return {path:"/api/admin/users",method:"GET",fixture};
  case "admin.promote":return {path:"/api/admin/users/"+id(p.user_id)+"/promote",method:"POST",fixture};
  case "admin.revoke":return {path:"/api/admin/users/"+id(p.user_id)+"/revoke",method:"POST",fixture};
  case "admin.gm-recover":return {path:"/api/admin/campaigns/"+id(p.campaign_id)+"/recover-gm",method:"POST",data:{user_id:p.user_id},fixture};
  default:throw new ProtocolError("Unknown operation");
 }
}
async function limitedFrame(req) {
 if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/octet-stream")
  throw new ProtocolError("Binary content type required");
 const declared=Number(req.headers.get("content-length"));
 if(req.headers.has("content-length")&&(!Number.isSafeInteger(declared)||declared>HEADER_SIZE+MAX_PAYLOAD))
  throw new ProtocolError("Frame too large");
 if(!req.body)throw new ProtocolError("Missing frame");
 const reader=req.body.getReader(),parts=[];
 let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>HEADER_SIZE+MAX_PAYLOAD)throw new ProtocolError("Frame too large");
   parts.push(value);
  }
 }catch(error){
  await reader.cancel().catch(()=>{});
  throw error;
 }
 const result=new Uint8Array(size);
 let offset=0;
 for(const part of parts){result.set(part,offset);offset+=part.length;}
 return result;
}
async function protocolRequest(req,env,clock){
 try{
  const incoming=decodeMessage(await limitedFrame(req),"request");
  const target=protocolTarget(incoming.type,incoming.payload);
  const headers=new Headers(req.headers);
  headers.set("x-dev-fixtures",target.fixture?"1":"0");
  headers.delete("content-length");
  headers.delete("content-type");
  let body;
  if(target.data!==undefined){
   headers.set("content-type","application/json");
   body=JSON.stringify(target.data);
  }
  const request=new Request(new URL(target.path,req.url),{method:target.method,headers,body});
  const result=await handleRequest(request,env,clock);
  const data=await result.json();
  const frame=encodeMessage("operation.result",{status:result.status,data},incoming.requestId);
  return new Response(frame,{status:result.status,headers:{
   "content-type":"application/octet-stream","cache-control":"no-store",
   "x-content-type-options":"nosniff"
  }});
 }catch(error){
  if(error instanceof ProtocolError)return fail(400,error.message);
  console.error("Protocol request failed",error);
  return fail(500,"Server error");
 }
}

export async function handleRequest(req, env, clock = () => Date.now()) {
  const url = new URL(req.url), path = url.pathname, method = req.method.toUpperCase(), now = clock();
  if (path === "/health" && method === "GET") return json({service:"reactive-character-server",alpha:true,mode:localDevelopment(req,env)?"development":"disabled"});
  if (path === "/" && method === "GET") return new Response(PAGE, {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
  if(path==="/offline" && method==="GET")return new Response(OFFLINE_PAGE,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
  if(path==="/offline-sw.js" && method==="GET")return new Response(OFFLINE_SW,{headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store","service-worker-allowed":"/","x-content-type-options":"nosniff"}});
  if (!path.startsWith("/api/")) return fail(404,"Not found");
  if (!localDevelopment(req, env)) return fail(503,"This alpha has no production authentication. Local development only.");
  if (!env.DB) return fail(503,"D1 database not configured");
  if(path==="/api/protocol" && method==="POST")return protocolRequest(req,env,clock);
  try {
    // The localhost-only identity picker must load before any account is selected.
    if (path === "/api/dev/users" && method === "GET")
      return json({users:await dbAll(env.DB,
        "SELECT id,display_name,is_admin,last_active_at FROM users WHERE is_test_data=1 ORDER BY id")});
    const actor = await actorFor(req,env,now);
    if (!actor) return fail(401,"Choose a local test account");
    const fixtureView = req.headers.get("x-dev-fixtures") === "1";
    // Fixture view exists only for simulated test identities on localhost.
    // Ordinary accounts never receive this header-based capability.
    const fixtures = fixtureView;
    const campaignFilter = fixtures ? " AND c.is_test_data=1" : " AND c.is_test_data=0";
    const userFilter = fixtures ? " AND is_test_data=1" : " AND is_test_data=0";
    // Developer character selector lists all campaigns this identity belongs to,
    // regardless of the normal/test filter used by the admin campaign browser.
    // Never include campaigns merely because the identity is a server admin.
    if (path === "/api/my-campaigns" && method === "GET") {
      const rows=await dbAll(env.DB,
        "SELECT c.id,c.name,c.is_test_data,m.is_gm FROM campaigns c JOIN memberships m ON m.campaign_id=c.id WHERE m.user_id=? ORDER BY c.name,c.id",actor.id);
      return json({campaigns:rows});
    }
    if (path === "/api/characters" && method === "GET") {
      // Same authorization as each campaign's character list. A user sees
      // assigned PCs and, for campaigns where they are a GM, every character.
      // Test fixtures may be included only by the localhost developer console.
      const rows=await dbAll(env.DB,
        "SELECT c.id,c.campaign_id,ca.name AS campaign_name,ca.is_test_data,c.name,c.version,c.uploaded_by,COUNT(cp.user_id) AS players FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id JOIN memberships m ON m.campaign_id=c.campaign_id AND m.user_id=? LEFT JOIN character_players cp ON cp.character_id=c.id WHERE (m.is_gm=1 OR EXISTS(SELECT 1 FROM character_players mine WHERE mine.character_id=c.id AND mine.user_id=?)) GROUP BY c.id ORDER BY ca.name,c.name,c.id",
        actor.id,actor.id);
      return json({characters:rows});
    }
    if (path === "/api/me" && method === "GET")
      return json({user:{id:actor.id,name:actor.display_name,is_admin:!!actor.is_admin},developer:true});
    if (path === "/api/campaigns" && method === "GET") {
      if (actor.is_admin && url.searchParams.get("admin") === "1") {
        return json({campaigns:await dbAll(env.DB,
          "SELECT c.id,c.name,c.is_test_data,COUNT(m.user_id) AS members FROM campaigns c LEFT JOIN memberships m ON m.campaign_id=c.id WHERE 1=1"+campaignFilter+" GROUP BY c.id ORDER BY c.name")});
      }
      return json({campaigns:await dbAll(env.DB,
        "SELECT c.id,c.name,m.is_gm,c.is_test_data FROM campaigns c JOIN memberships m ON m.campaign_id=c.id WHERE m.user_id=?"+campaignFilter+" ORDER BY c.name",actor.id)});
    }
    if (path === "/api/campaigns" && method === "POST") {
      const input=await body(req);
      const isTest=!!input.is_test_data;
      if (isTest && !fixtures)
        return fail(403,"Select the administrator test-data view to create test campaigns");
      const requestedName=normalizeCampaignName(input.name);
      // The developer chooses a human-readable name; the server adds test_.
      const name=isTest ? normalizeCampaignName(
        requestedName.startsWith("test_") ? requestedName : "test_"+requestedName
      ) : requestedName;
      const id=uuid();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO campaigns(id,name,created_by,is_test_data) VALUES(?,?,?,?)").bind(id,name,actor.id,isTest?1:0),
        env.DB.prepare("INSERT INTO memberships(campaign_id,user_id,is_gm) VALUES(?,?,1)").bind(id,actor.id)
      ]);
      await audit(env.DB,actor.id,"campaign.create",id);
      return json({id,name,is_gm:true},201);
    }
    // Every campaign member may upload unlimited characters; the uploader
    // becomes an assigned player, except a GM upload starts unassigned.
    const campaignCharacters=path.match(/^\/api\/campaigns\/([^/]+)\/characters$/);
    if (campaignCharacters && ["GET","POST"].includes(method)) {
      const campaignId=decodeURIComponent(campaignCharacters[1]);
      const campaign=await dbRow(env.DB,"SELECT id,is_test_data FROM campaigns WHERE id=?",campaignId);
      if (!campaign || (!!campaign.is_test_data)!==fixtures) return fail(404,"Campaign not found");
      const membership=await dbRow(env.DB,"SELECT is_gm FROM memberships WHERE campaign_id=? AND user_id=?",campaignId,actor.id);
      if (!membership) return fail(403,"Campaign membership required");
      if (method==="GET") {
        const rows=await dbAll(env.DB,
          "SELECT c.id,c.name,c.version,c.uploaded_by,COUNT(cp.user_id) AS players FROM characters c LEFT JOIN character_players cp ON cp.character_id=c.id WHERE c.campaign_id=? AND (?=1 OR EXISTS(SELECT 1 FROM character_players mine WHERE mine.character_id=c.id AND mine.user_id=?)) GROUP BY c.id ORDER BY c.created_at,c.name",
          campaignId,membership.is_gm,actor.id);
        return json({characters:rows});
      }
      const input=await body(req), name=characterName(input.name),
        tokens=characterTokens(input.character_sheet_tokens);
      const id=uuid(),nowIso=iso(now);
      const statements=[
        env.DB.prepare("INSERT INTO characters(id,campaign_id,name,character_sheet_tokens,uploaded_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
          .bind(id,campaignId,name,tokens,actor.id,nowIso,nowIso)
      ];
      if (!membership.is_gm) statements.push(
        env.DB.prepare("INSERT INTO character_players(character_id,user_id,assigned_by,assigned_at) VALUES(?,?,?,?)")
          .bind(id,actor.id,actor.id,nowIso));
      await env.DB.batch(statements);
      await audit(env.DB,actor.id,"character.upload",id,{campaign_id:campaignId});
      return json({id,name,version:1,players:membership.is_gm?[]:[actor.id]},201);
    }

    const characterMatch=path.match(/^\/api\/characters\/([^/]+)$/);
    if (characterMatch && method==="GET") {
      const access=await characterAccess(env.DB,decodeURIComponent(characterMatch[1]),actor,fixtures);
      if (!access) return fail(404,"Character not found");
      if (!access.allowed) return fail(403,"Character access denied");
      const players=await dbAll(env.DB,
        "SELECT user_id FROM character_players WHERE character_id=? ORDER BY assigned_at,user_id",access.ch.id);
      return json({character:publicCharacter(access.ch,players.map(p=>p.user_id))});
    }

    // Changes originating on a disconnected client must carry immutable operation
    // IDs and the revision on which the edit was based. An acknowledged retry
    // returns its original receipt; a divergent edit receives HTTP 409.
    const characterSync=path.match(/^\/api\/characters\/([^/]+)\/(sync|revisions)$/);
    if(characterSync && (method==="POST"||method==="GET")){
      const access=await characterAccess(env.DB,decodeURIComponent(characterSync[1]),actor,fixtures);
      if(!access)return fail(404,"Character not found");
      if(!access.allowed)return fail(403,"Character access denied");
      if(characterSync[2]==="revisions"){
        if(method!=="GET")return fail(405,"Method not allowed");
        const previous=await dbAll(env.DB,
          "SELECT version,name,character_sheet_tokens,changed_by,recorded_at FROM character_revisions WHERE character_id=? ORDER BY version",access.ch.id);
        return json({character_id:access.ch.id,revisions:[...previous.map(r=>({
          ...r,character_sheet_tokens:JSON.parse(r.character_sheet_tokens)
        })),{version:access.ch.version,name:access.ch.name,
          character_sheet_tokens:JSON.parse(access.ch.character_sheet_tokens),
          changed_by:access.ch.updated_by||access.ch.uploaded_by,recorded_at:access.ch.updated_at}]});
      }
      if(method!=="POST")return fail(405,"Method not allowed");
      // A player may synchronize a PC they control. GMs synchronize
      // unassigned NPCs/GM characters only; GM status alone must not
      // let them overwrite a player's sheet.
      const playerCount=await count(env.DB,
        "SELECT COUNT(*) AS n FROM character_players WHERE character_id=?",access.ch.id);
      if(!(access.assigned || (access.membership?.is_gm && playerCount===0)))
        return fail(403,"Only assigned players or the GM of an unassigned character can synchronize");
      const input=await body(req);
      if(!validSyncInput(input))return fail(400,"Invalid sync operation ID or expected revision");
      // Validate payload even on retries; a retry is never permitted to
      // bypass the normal schema checks or permissions.
      const name=characterName(input.name),tokens=characterTokens(input.character_sheet_tokens);
      const hash=await syncHash({expected_version:input.expected_version,name,tokens});
      const receipt=await dbRow(env.DB,"SELECT * FROM sync_receipts WHERE operation_id=?",input.operation_id);
      if(receipt){
        if(receipt.actor_id!==actor.id || receipt.kind!=="character.replace" || receipt.resource_id!==access.ch.id || receipt.payload_hash!==hash)
          return fail(409,"Operation ID already used");
        return json({ok:true,already_applied:true,version:receipt.version,operation_id:input.operation_id});
      }
      const isoNow=iso(now);
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO character_revisions(character_id,version,name,character_sheet_tokens,changed_by,recorded_at) SELECT id,version,name,character_sheet_tokens,COALESCE(updated_by,uploaded_by),updated_at FROM characters WHERE id=? AND version=?")
          .bind(access.ch.id,input.expected_version),
        env.DB.prepare("UPDATE characters SET name=?,character_sheet_tokens=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND changes()=1")
          .bind(name,tokens,isoNow,actor.id,access.ch.id,input.expected_version),
        env.DB.prepare("INSERT INTO sync_receipts(operation_id,actor_id,kind,payload_hash,resource_id,version,created_at) SELECT ?,?,'character.replace',?,?,version,? FROM characters WHERE id=? AND version=? AND changes()=1")
          .bind(input.operation_id,actor.id,hash,access.ch.id,isoNow,access.ch.id,input.expected_version+1)
      ]);
      const accepted=await dbRow(env.DB,"SELECT * FROM sync_receipts WHERE operation_id=?",input.operation_id);
      if(accepted && accepted.actor_id===actor.id && accepted.resource_id===access.ch.id && accepted.kind==="character.replace" && accepted.payload_hash===hash)
        return json({ok:true,version:accepted.version,operation_id:input.operation_id});
      const latest=await dbRow(env.DB,"SELECT version FROM characters WHERE id=?",access.ch.id);
      return json({error:"Character revision conflict",current_version:latest.version},409);
    }

    const noteSync=path.match(/^\/api\/notes\/([^/]+)\/(sync|revisions)$/);
    if(noteSync && (method==="POST"||method==="GET")){
      const note=await dbRow(env.DB,
        "SELECT n.*,c.campaign_id,ca.is_test_data FROM character_notes n JOIN characters c ON c.id=n.character_id JOIN campaigns ca ON ca.id=c.campaign_id WHERE n.id=?",
        decodeURIComponent(noteSync[1]));
      if(!note || (!!note.is_test_data)!==fixtures)return fail(404,"Note not found");
      const access=await characterAccess(env.DB,note.character_id,actor,fixtures);
      if(!access?.allowed)return fail(403,"Character access denied");
      // The author exclusively controls updates and complete history.
      // Shared visibility grants reading only, not ownership.
      if(note.author_id!==actor.id)return fail(403,"Note author required");
      if(noteSync[2]==="revisions"){
        if(method!=="GET")return fail(405,"Method not allowed");
        const previous=await dbAll(env.DB,
          "SELECT version,body,visibility,changed_by,recorded_at FROM note_revisions WHERE note_id=? ORDER BY version",note.id);
        return json({note_id:note.id,revisions:[...previous,{
          version:note.version,body:note.body,visibility:note.visibility,
          changed_by:note.updated_by||note.author_id,recorded_at:note.updated_at}]});
      }
      if(method!=="POST")return fail(405,"Method not allowed");
      const input=await body(req);
      if(!validSyncInput(input))return fail(400,"Invalid sync operation ID or expected revision");
      const updated=noteSyncText(input.body);
      const hash=await syncHash({expected_version:input.expected_version,body:updated});
      const receipt=await dbRow(env.DB,"SELECT * FROM sync_receipts WHERE operation_id=?",input.operation_id);
      if(receipt){
        if(receipt.actor_id!==actor.id || receipt.kind!=="note.replace" || receipt.resource_id!==note.id || receipt.payload_hash!==hash)
          return fail(409,"Operation ID already used");
        return json({ok:true,already_applied:true,version:receipt.version,operation_id:input.operation_id});
      }
      const isoNow=iso(now);
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO note_revisions(note_id,version,body,visibility,changed_by,recorded_at) SELECT id,version,body,visibility,COALESCE(updated_by,author_id),updated_at FROM character_notes WHERE id=? AND version=?")
          .bind(note.id,input.expected_version),
        env.DB.prepare("UPDATE character_notes SET body=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? AND changes()=1")
          .bind(updated,isoNow,actor.id,note.id,input.expected_version),
        env.DB.prepare("INSERT INTO sync_receipts(operation_id,actor_id,kind,payload_hash,resource_id,version,created_at) SELECT ?,?,'note.replace',?,?,version,? FROM character_notes WHERE id=? AND version=? AND changes()=1")
          .bind(input.operation_id,actor.id,hash,note.id,isoNow,note.id,input.expected_version+1)
      ]);
      const accepted=await dbRow(env.DB,"SELECT * FROM sync_receipts WHERE operation_id=?",input.operation_id);
      if(accepted && accepted.actor_id===actor.id && accepted.resource_id===note.id && accepted.kind==="note.replace" && accepted.payload_hash===hash)
        return json({ok:true,version:accepted.version,operation_id:input.operation_id});
      const latest=await dbRow(env.DB,"SELECT version FROM character_notes WHERE id=?",note.id);
      return json({error:"Note revision conflict",current_version:latest.version},409);
    }

    const characterAssignment=path.match(/^\/api\/characters\/([^/]+)\/assign$/);
    if (characterAssignment && method==="POST") {
      const access=await characterAccess(env.DB,decodeURIComponent(characterAssignment[1]),actor,fixtures);
      if (!access) return fail(404,"Character not found");
      if (!access.membership?.is_gm) return fail(403,"Campaign GM required");
      const input=await body(req);
      if (typeof input.user_id!=="string") return fail(400,"Choose a member account");
      const member=await dbRow(env.DB,"SELECT user_id FROM memberships WHERE campaign_id=? AND user_id=?",access.ch.campaign_id,input.user_id);
      if (!member) return fail(400,"Target must be a member of this campaign");
      await dbRun(env.DB,"INSERT OR IGNORE INTO character_players(character_id,user_id,assigned_by,assigned_at) VALUES(?,?,?,?)",
        access.ch.id,input.user_id,actor.id,iso(now));
      await audit(env.DB,actor.id,"character.assign",access.ch.id,{user_id:input.user_id});
      const players=await dbAll(env.DB,"SELECT user_id FROM character_players WHERE character_id=? ORDER BY assigned_at,user_id",access.ch.id);
      return json({ok:true,players:players.map(p=>p.user_id)});
    }

    const notesMatch=path.match(/^\/api\/characters\/([^/]+)\/notes$/);
    if (notesMatch && ["GET","POST"].includes(method)) {
      const access=await characterAccess(env.DB,decodeURIComponent(notesMatch[1]),actor,fixtures);
      if (!access) return fail(404,"Character not found");
      if (!access.allowed) return fail(403,"Character access denied");
      if (method==="GET") {
        // A GM sees shared notes, but not the author's private notes. Players
        // sharing a character see each other's shared notes, never private ones.
        const rows=await dbAll(env.DB,
          "SELECT id,character_id,author_id,visibility,body,version,created_at,updated_at FROM character_notes WHERE character_id=? AND (visibility='shared' OR author_id=?) ORDER BY created_at,id",
          access.ch.id,actor.id);
        return json({notes:rows});
      }
      const input=await body(req);
      if (input.visibility!=="private" && input.visibility!=="shared")
        return fail(400,"Note visibility must be private or shared");
      const note=noteText(input.body), id=uuid(),created=iso(now);
      await dbRun(env.DB,"INSERT INTO character_notes(id,character_id,author_id,visibility,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        id,access.ch.id,actor.id,input.visibility,note,created,created);
      await audit(env.DB,actor.id,"note.create",id,{character_id:access.ch.id,visibility:input.visibility});
      return json({id,author_id:actor.id,visibility:input.visibility,body:note,version:1},201);
    }

    if (path === "/api/admin/users" && method === "GET") {
      if (!actor.is_admin) return fail(403,"Server administrator required");
      return json({users:await dbAll(env.DB,
        "SELECT id,display_name,is_admin,last_active_at FROM users WHERE 1=1"+userFilter+" ORDER BY display_name")});
    }
    const promote=path.match(/^\/api\/admin\/users\/([^/]+)\/promote$/);
    if (promote && method === "POST") {
      if (!actor.is_admin) return fail(403,"Server administrator required");
      const target=await dbRow(env.DB,"SELECT * FROM users WHERE id=?",decodeURIComponent(promote[1]));
      if (!target || (target.is_test_data && !fixtures)) return fail(404,"User not found");
      await dbRun(env.DB,"UPDATE users SET is_admin=1 WHERE id=?",target.id);
      await audit(env.DB,actor.id,"admin.promote",target.id);
      return json({ok:true});
    }
    const revokeAdmin=path.match(/^\/api\/admin\/users\/([^/]+)\/revoke$/);
    if (revokeAdmin && method === "POST") {
      if (!actor.is_admin) return fail(403,"Server administrator required");
      const target=await dbRow(env.DB,"SELECT * FROM users WHERE id=?",decodeURIComponent(revokeAdmin[1]));
      const admins=await count(env.DB,"SELECT COUNT(*) AS n FROM users WHERE is_admin=1");
      if (!canRevokeAdministrator(actor,target,admins,now)) return fail(403,"Administrator not eligible for inactivity revocation");
      // Recheck in SQL to prevent a stale interface from revoking a newly active admin.
      const changed=await dbRun(env.DB,
        "UPDATE users SET is_admin=0 WHERE id=? AND id<>? AND is_admin=1 AND last_active_at<=? AND (SELECT COUNT(*) FROM users WHERE is_admin=1)>1",
        target.id,actor.id,iso(now-90*86400000));
      if (!changed.meta?.changes) return fail(409,"Administrator became active or is no longer eligible");
      await audit(env.DB,actor.id,"admin.revoke",target.id);
      return json({ok:true});
    }
    const members=path.match(/^\/api\/campaigns\/([^/]+)\/members$/);
    if (members && method === "GET") {
      const campaign=await dbRow(env.DB,"SELECT * FROM campaigns WHERE id=?",decodeURIComponent(members[1]));
      if (!campaign || (campaign.is_test_data && !fixtures)) return fail(404,"Campaign not found");
      const own=await dbRow(env.DB,"SELECT * FROM memberships WHERE campaign_id=? AND user_id=?",campaign.id,actor.id);
      if (!own && !actor.is_admin) return fail(403,"Campaign membership required");
      return json({members:await dbAll(env.DB,
        "SELECT u.id,u.display_name,u.last_active_at,m.is_gm FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.campaign_id=? ORDER BY u.display_name",campaign.id)});
    }
    const recovery=path.match(/^\/api\/admin\/campaigns\/([^/]+)\/recover-gm$/);
    if (recovery && method==="POST") {
      if (!actor.is_admin) return fail(403,"Server administrator required");
      const campaign=await dbRow(env.DB,"SELECT * FROM campaigns WHERE id=?",decodeURIComponent(recovery[1]));
      if (!campaign || (campaign.is_test_data && !fixtures)) return fail(404,"Campaign not found");
      const input=await body(req);
      const gms=await dbAll(env.DB,"SELECT u.last_active_at FROM users u JOIN memberships m ON u.id=m.user_id WHERE m.campaign_id=? AND m.is_gm=1",campaign.id);
      if (!canRecoverCampaignGM(actor,gms,now)) return fail(403,"At least one GM is active");
      const target=await dbRow(env.DB,"SELECT * FROM memberships WHERE campaign_id=? AND user_id=?",campaign.id,input.user_id);
      if (!target) return fail(404,"Target must already be a campaign member");
      // Last-activity guard checked again in the same statement.
      const result=await dbRun(env.DB,
        "UPDATE memberships SET is_gm=1 WHERE campaign_id=? AND user_id=? AND NOT EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.campaign_id=? AND m.is_gm=1 AND u.last_active_at>?)",
        campaign.id,input.user_id,campaign.id,iso(now-90*86400000));
      if (!result.meta?.changes) return fail(409,"Campaign GMs became active");
      await audit(env.DB,actor.id,"campaign.gm.recover",campaign.id,{user_id:input.user_id});
      return json({ok:true});
    }
    const invites=path.match(/^\/api\/campaigns\/([^/]+)\/invites$/);
    if (invites && method==="POST") {
      const campaign=await dbRow(env.DB,"SELECT * FROM campaigns WHERE id=?",decodeURIComponent(invites[1]));
      if (!campaign || (campaign.is_test_data && !fixtures)) return fail(404,"Campaign not found");
      const member=await dbRow(env.DB,"SELECT * FROM memberships WHERE campaign_id=? AND user_id=?",campaign.id,actor.id);
      if (!canManageCampaign(member)) return fail(403,"Campaign GM required");
      const input=await body(req);
      const spec=invitationSpec(input.kind,input.expires_days ?? 7,input.max_uses ?? 10);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
      const id=uuid(), expires=iso(now+spec.expiresDays*86400000);
      await dbRun(env.DB,"INSERT INTO invitations(id,campaign_id,kind,token_hash,issued_by,expires_at,max_uses) VALUES(?,?,?,?,?,?,?)",
        id,campaign.id,spec.kind,await tokenDigest(token),actor.id,expires,spec.maxUses);
      await audit(env.DB,actor.id,"invitation.create",id,{campaign_id:campaign.id,kind:spec.kind});
      return json({id,kind:spec.kind,expires_at:expires,max_uses:spec.maxUses,link:url.origin+"/?invite="+token},201);
    }
    if (path==="/api/invites/accept" && method==="POST") {
      const input=await body(req);
      if (typeof input.token!=="string" || !/^[0-9a-f]{64}$/.test(input.token)) return fail(400,"Invalid invitation");
      const invite=await dbRow(env.DB,"SELECT i.*,c.is_test_data FROM invitations i JOIN campaigns c ON c.id=i.campaign_id WHERE i.token_hash=?",await tokenDigest(input.token));
      if (!invitationValid(invite,now) || (invite.is_test_data && !fixtures)) return fail(400,"Invitation expired or exhausted");
      const existing=await dbRow(env.DB,"SELECT * FROM memberships WHERE campaign_id=? AND user_id=?",invite.campaign_id,actor.id);
      if (existing && (invite.kind!=="gm" || existing.is_gm)) return json({ok:true,already_member:true});
      // In a D1 batch, a failed conditional UPDATE followed by membership changes
      // must not grant privileges. Use the SQLite changes() value in the following statement.
      await env.DB.batch([
        env.DB.prepare("UPDATE invitations SET uses=uses+1 WHERE id=? AND revoked_at IS NULL AND expires_at>? AND uses<max_uses").bind(invite.id,iso(now)),
        env.DB.prepare("INSERT INTO memberships(campaign_id,user_id,is_gm) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(campaign_id,user_id) DO UPDATE SET is_gm=CASE WHEN excluded.is_gm=1 THEN 1 ELSE memberships.is_gm END")
          .bind(invite.campaign_id,actor.id,invite.kind==="gm"?1:0)
      ]);
      const membership=await dbRow(env.DB,"SELECT * FROM memberships WHERE campaign_id=? AND user_id=?",invite.campaign_id,actor.id);
      if (!membership || (invite.kind==="gm" && !membership.is_gm)) return fail(409,"Invitation already used");
      await audit(env.DB,actor.id,"invitation.accept",invite.id);
      return json({ok:true,campaign_id:invite.campaign_id,is_gm:!!membership.is_gm});
    }
    return fail(404,"API route not found");
  } catch (error) {
    if (error instanceof SyntaxError) return fail(400,"Invalid JSON");
    if (error instanceof Error && /^(Campaign name|Character name|Character sheet|Note text|Unknown invitation|Expiration|Group invitation|Request too large|Expected JSON)/.test(error.message))
      return fail(400,error.message);
    console.error("Character Server request failed",error);
    return fail(500,"Server error");
  }
}

export default {fetch(request,env){return handleRequest(request,env);}};
