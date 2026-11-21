// Self-contained localhost development console. Not a production login page.
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reactive — Character Server (local alpha)</title>
<style>
:root{font:16px system-ui,sans-serif;color:#242b36;background:#f5f6f8}body{max-width:950px;margin:2rem auto;padding:0 1rem}
header{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
section{background:white;border:1px solid #d4d9e0;border-radius:12px;padding:1.2rem;margin:1rem 0}
h1{font-size:1.6rem}h2{font-size:1.2rem}label{display:block;font-weight:600;margin:.5rem 0}
input,select,button{font:inherit;padding:.55rem;border:1px solid #aeb8c6;border-radius:7px;max-width:100%;margin:.15rem}
button{cursor:pointer;background:#24395c;color:white}button:disabled{opacity:.4}button.secondary{background:#eceff4;color:#232e41}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}.muted{color:#596576}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #e8eaf0;padding:.6rem}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f3f6;padding:1rem;border-radius:6px}
.badge{font-size:.75rem;border-radius:4px;padding:.1rem .4rem;background:#e6eaf1}
#error{color:#8e2323;font-weight:600}
</style></head>
<body><header><div><h1>Reactive Character Server</h1><div class="muted">Local alpha · Developer simulation only</div></div>
<div><label for="identity">Act as test account</label><select id="identity"></select></div></header>
<section><h2>Campaigns</h2><p class="muted">The developer switcher enables test fixtures explicitly; ordinary campaign listings hide them.</p>
<div class="row"><button id="refresh">Refresh</button><label><input type="checkbox" id="fixtures" checked> Developer fixture view</label><label><input type="checkbox" id="adminView"> Administrator view</label></div>
<div id="campaigns"></div></section>
<section><h2>Create campaign</h2><form id="create"><label>Campaign name (Unicode accepted) <input id="campaignName" required maxlength="100" placeholder="Víkingaöld – Þórsheimr"></label>
<label><input type="checkbox" id="testCampaign" checked> Mark test campaign (requires test_ prefix and administrator)</label><button>Create</button></form></section>
<section><h2>Campaign members and invitations</h2>
<label>Campaign <select id="campaignSelect"></select></label><button id="members">Show members</button>
<div id="memberList"></div>
<form id="inviteForm"><div class="row"><label>Type <select id="kind"><option value="player">Single player</option><option value="group">Group players</option><option value="gm">Single GM</option></select></label>
<label>Expires in days <input type="number" id="expires" value="7" min="1" max="30"></label>
<label>Group limit <input type="number" id="maxUses" value="10" min="1" max="100"></label></div>
<button>Generate invitation</button></form><pre id="inviteLink" hidden></pre>
<form id="accept"><label>Accept invitation token or link <input id="token" size="44" required></label><button>Accept invitation</button></form>
</section><section><h2>Administrator users</h2><p class="muted">Only administrators can list and promote accounts. Inactivity revocation uses server-side checks.</p><button id="users">Show users</button><div id="userList"></div></section>
<section><h2>Response</h2><div id="error" role="alert"></div><pre id="output">Choose a test account to begin.</pre></section>
<script>
const el=id=>document.getElementById(id);
let campaigns=[];
const actor=()=>el("identity").value;
async function request(path,method="GET",payload){
 const headers={"x-dev-user":actor(),"x-dev-fixtures":el("fixtures").checked?"1":"0"};
 if(payload!==undefined)headers["content-type"]="application/json";
 const res=await fetch(path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
 const data=await res.json();
 if(!res.ok)throw Error(data.error||"Request failed");
 el("error").textContent="";el("output").textContent=JSON.stringify(data,null,2);return data;
}
async function run(fn){try{await fn()}catch(err){el("error").textContent=err.message;}}
async function init(){
 const data=await request("/api/dev/users");
 el("identity").replaceChildren(...data.users.map(u=>new Option(u.display_name+(u.is_admin?" [admin]":""),u.id)));
 el("identity").value="test_admin";await refresh();
}
async function refresh(){
 const q=el("adminView").checked?"?admin=1":"";
 const data=await request("/api/campaigns"+q);campaigns=data.campaigns;
 const tbody=document.createElement("table");const head=tbody.insertRow();
 ["Campaign","Access","Members"].forEach(x=>{const th=document.createElement("th");th.textContent=x;head.append(th)});
 for(const c of campaigns){const row=tbody.insertRow();[c.name,c.is_gm?"GM":c.is_gm===0?"Player":c.is_test_data?"Test":"Admin view",c.members??""].forEach(x=>{const td=row.insertCell();td.textContent=String(x)})}
 el("campaigns").replaceChildren(tbody);
 el("campaignSelect").replaceChildren(...campaigns.map(c=>new Option(c.name,c.id)));
}
el("identity").addEventListener("change",()=>run(refresh));
for(const id of ["refresh","fixtures","adminView"])el(id).addEventListener("click",()=>run(refresh));
el("create").addEventListener("submit",e=>{e.preventDefault();run(async()=>{await request("/api/campaigns","POST",{name:el("campaignName").value,is_test_data:el("testCampaign").checked});await refresh()})});
el("members").addEventListener("click",()=>run(async()=>{
 const d=await request("/api/campaigns/"+encodeURIComponent(el("campaignSelect").value)+"/members");
 el("memberList").textContent=d.members.map(m=>m.display_name+(m.is_gm?" (GM)":"")+" — "+m.last_active_at).join("\n");
 el("memberList").style.whiteSpace="pre-wrap";
}));
el("inviteForm").addEventListener("submit",e=>{e.preventDefault();run(async()=>{
 const d=await request("/api/campaigns/"+encodeURIComponent(el("campaignSelect").value)+"/invites","POST",
 {kind:el("kind").value,expires_days:Number(el("expires").value),max_uses:Number(el("maxUses").value)});
 el("inviteLink").hidden=false;el("inviteLink").textContent=d.link;
})});
el("accept").addEventListener("submit",e=>{e.preventDefault();run(async()=>{
 let token=el("token").value.trim();if(token.includes("invite="))token=new URL(token).searchParams.get("invite");
 await request("/api/invites/accept","POST",{token});await refresh();
})});
el("users").addEventListener("click",()=>run(async()=>{
 const d=await request("/api/admin/users");const table=document.createElement("table");
 for(const u of d.users){const tr=table.insertRow();const td=tr.insertCell();td.textContent=u.display_name+(u.is_admin?" [admin]":"")+" · last active: "+u.last_active_at;
 const actions=tr.insertCell();const b=document.createElement("button");b.textContent=u.is_admin?"Revoke inactive admin":"Promote to admin";b.onclick=()=>run(async()=>{
 if(!confirm(b.textContent+" "+u.display_name+"?"))return;
 await request("/api/admin/users/"+encodeURIComponent(u.id)+"/"+(u.is_admin?"revoke":"promote"),"POST");el("users").click();
 });actions.append(b)}
 el("userList").replaceChildren(table);
}));
const urlToken=new URL(location.href).searchParams.get("invite");if(urlToken)el("token").value=urlToken;
run(init);
</script></body></html>`;
