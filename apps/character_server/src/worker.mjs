import { canManageCampaign, canRecoverCampaignGM, canRevokeAdministrator,
  invitationSpec, invitationValid, normalizeCampaignName } from "./policy.mjs";
import { PAGE } from "./page.mjs";

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

async function body(req) {
  const text = await req.text();
  if (text.length > 10000) throw new Error("Request too large");
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object");
  return parsed;
}

export async function handleRequest(req, env, clock = () => Date.now()) {
  const url = new URL(req.url), path = url.pathname, method = req.method.toUpperCase(), now = clock();
  if (path === "/health" && method === "GET") return json({service:"reactive-character-server",alpha:true,mode:localDevelopment(req,env)?"development":"disabled"});
  if (path === "/" && method === "GET") return new Response(PAGE, {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
  if (!path.startsWith("/api/")) return fail(404,"Not found");
  if (!localDevelopment(req, env)) return fail(503,"This alpha has no production authentication. Local development only.");
  if (!env.DB) return fail(503,"D1 database not configured");
  try {
    const actor = await actorFor(req,env,now);
    if (!actor) return fail(401,"Choose a local test account");
    const fixtures = req.headers.get("x-dev-fixtures") === "1";
    // Test data can ONLY be seen through the explicit localhost developer simulator.
    const testClause = fixtures ? "" : " AND is_test_data=0";
    if (path === "/api/me" && method === "GET")
      return json({user:{id:actor.id,name:actor.display_name,is_admin:!!actor.is_admin},developer:true});
    if (path === "/api/dev/users" && method === "GET") {
      // Dedicated developer-only test identity switcher.
      return json({users:await dbAll(env.DB,"SELECT id,display_name,is_admin,last_active_at FROM users WHERE is_test_data=1 ORDER BY id")});
    }
    if (path === "/api/campaigns" && method === "GET") {
      if (actor.is_admin && url.searchParams.get("admin") === "1") {
        return json({campaigns:await dbAll(env.DB,
          "SELECT c.id,c.name,c.is_test_data,COUNT(m.user_id) AS members FROM campaigns c LEFT JOIN memberships m ON m.campaign_id=c.id WHERE 1=1"+testClause+" GROUP BY c.id ORDER BY c.name")});
      }
      return json({campaigns:await dbAll(env.DB,
        "SELECT c.id,c.name,m.is_gm FROM campaigns c JOIN memberships m ON m.campaign_id=c.id WHERE m.user_id=?"+testClause+" ORDER BY c.name",actor.id)});
    }
    if (path === "/api/campaigns" && method === "POST") {
      const input=await body(req),name=normalizeCampaignName(input.name);
      const isTest=!!input.is_test_data;
      if (isTest && (!fixtures || !actor.is_admin || !name.startsWith("test_")))
        return fail(403,"Test campaigns require developer admin access and test_ names");
      const id=uuid();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO campaigns(id,name,created_by,is_test_data) VALUES(?,?,?,?)").bind(id,name,actor.id,isTest?1:0),
        env.DB.prepare("INSERT INTO memberships(campaign_id,user_id,is_gm) VALUES(?,?,1)").bind(id,actor.id)
      ]);
      await audit(env.DB,actor.id,"campaign.create",id);
      return json({id,name,is_gm:true},201);
    }
    if (path === "/api/admin/users" && method === "GET") {
      if (!actor.is_admin) return fail(403,"Server administrator required");
      return json({users:await dbAll(env.DB,
        "SELECT id,display_name,is_admin,last_active_at FROM users WHERE 1=1"+testClause+" ORDER BY display_name")});
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
    if (error instanceof Error && /^(Campaign name|Unknown invitation|Expiration|Group invitation|Request too large|Expected JSON)/.test(error.message))
      return fail(400,error.message);
    console.error("Character Server request failed",error);
    return fail(500,"Server error");
  }
}

export default {fetch(request,env){return handleRequest(request,env);}};
