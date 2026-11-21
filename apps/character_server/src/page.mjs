// Self-contained localhost development console. Not a production login page.
export const PAGE = String.raw`<!doctype html>
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
<section><h2>Campaigns</h2><p class="muted">Test campaigns are separate from ordinary campaigns. Only the local developer console can access test data.</p>
<div class="row"><button id="refresh">Refresh</button><label>Campaign type <select id="campaignType"><option value="normal">Normal campaigns</option><option value="test">Test campaigns</option></select></label>
<label>List <select id="scope"><option value="mine">My campaigns</option><option value="all">All campaigns (administrator)</option></select></label></div>
<div id="campaigns"></div></section>
<section><h2>Create campaign</h2><form id="create"><label>Campaign name (Unicode accepted) <input id="campaignName" required maxlength="100" placeholder="Víkingaöld – Þórsheimr"></label>
<label><input type="checkbox" id="testCampaign"> Create as test campaign (test_ prefix added automatically)</label><button>Create</button><p class="muted" id="createHint">Normal campaign: visible only to members and to administrators in their storage view.</p></form></section>
<section><h2>Characters</h2>
<p class="muted">This alpha stores placeholder character_sheet_tokens as JSON. Players may upload any number of characters. GMs may upload and assign characters to one or more campaign members.</p>
<form id="uploadCharacter">
<label>Character name <input id="characterName" required maxlength="100" placeholder="Auðun"></label>
<label>Placeholder character_sheet_tokens (JSON object) <textarea id="characterTokens" rows="3" cols="65">{}</textarea></label>
<button>Upload character to selected campaign</button></form>
<div class="row"><button id="loadCharacters">Load my accessible characters</button>
<label>Character <select id="characterSelect"></select></label><button id="viewCharacter">View character details</button></div>
<div id="characterDetails" class="muted"></div>
<form id="assignCharacter"><label>Assign selected character to campaign member (GM only)
<select id="assignedPlayer"></select></label><button>Add player to character</button></form>
<h3>Character notes</h3><div class="row"><button id="loadNotes">View accessible notes</button></div>
<div id="characterNotes"></div>
<form id="addNote"><label>Note <textarea id="noteText" rows="3" cols="65" required maxlength="4000"></textarea></label>
<label>Visibility <select id="noteVisibility">
<option value="private">Private (only my account)</option>
<option value="shared">Shared with all assigned players and campaign GMs</option>
</select></label><button>Create note</button></form>
</section>
<section><h2>Invitation test walkthrough</h2>
<p class="muted">The development database provides unassigned users specifically for testing the three invitation routes. No server administrator is needed to create the campaign or send invitations.</p>
<ol><li>Choose <strong>test_Campaign Creator (player, no admin rights)</strong> from the account selector.</li>
<li>Enter <strong>Invitation Playground</strong>, check <strong>Create as test campaign</strong>, and create it. The creator automatically becomes that campaign's GM.</li>
<li>Select the new campaign below and generate a <strong>Single player</strong> invitation. Copy the link, switch to <strong>test_Personal Invite Recipient</strong>, paste the link into <strong>Accept invitation</strong>, and accept it.</li>
<li>Switch back to the creator. Generate a <strong>Group players</strong> invitation with a limit of 2. Use it with <strong>test_Group Invite Recipient A</strong> and <strong>B</strong>. Try a third acceptance as <strong>test_Group Invite Overflow</strong>: it must be rejected.</li>
<li>Switch back to the creator, generate a <strong>Single GM</strong> invitation, and accept it as <strong>test_GM Invite Recipient</strong>. That user can now invite others but is not a server administrator.</li>
<li>Switch to <strong>test_Uninvited Outsider</strong> and verify that the campaign is not visible and that the outsider cannot generate invitations.</li></ol>
<p class="muted">Keep the generated invite link copied before switching users. The responses below report when an invitation is exhausted or permission is denied. Re-running the walkthrough requires fresh invitations or a newly named campaign.</p>
</section>
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
 const headers={"x-dev-user":actor(),"x-dev-fixtures":el("campaignType").value==="test"?"1":"0"};
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
 const q=el("scope").value==="all"?"?admin=1":"";
 const data=await request("/api/campaigns"+q);campaigns=data.campaigns;
 const tbody=document.createElement("table");const head=tbody.insertRow();
 ["Campaign","Access","Members"].forEach(x=>{const th=document.createElement("th");th.textContent=x;head.append(th)});
 for(const c of campaigns){const row=tbody.insertRow();[c.name,c.is_gm?"GM":c.is_gm===0?"Player":c.is_test_data?"Test":"Admin view",c.members??""].forEach(x=>{const td=row.insertCell();td.textContent=String(x)})}
 el("campaigns").replaceChildren(tbody);
 el("campaignSelect").replaceChildren(...campaigns.map(c=>new Option(c.name,c.id)));
 if(!campaigns.length) el("campaigns").insertAdjacentText("beforeend",el("campaignType").value==="test"?" No test campaigns available for this account.":" No normal campaigns available for this account.");
}
el("identity").addEventListener("change",()=>run(refresh));
el("refresh").addEventListener("click",()=>run(refresh));
for(const id of ["campaignType","scope"])el(id).addEventListener("change",()=>run(refresh));
el("testCampaign").addEventListener("change",()=>{
 el("createHint").textContent=el("testCampaign").checked
 ? "Test campaign: the server adds test_ to its name and displays it under Test campaigns. Any simulated local account can create one, and becomes its first GM."
 : "Normal campaign: visible only to members and to administrators in their storage view.";
});
el("create").addEventListener("submit",e=>{e.preventDefault();run(async()=>{
 const isTest=el("testCampaign").checked;
 // The developer checkbox controls what is created, independently of the
 // current campaign list filter. Select the corresponding list after saving.
 const headers={"x-dev-user":actor(),"x-dev-fixtures":isTest?"1":"0","content-type":"application/json"};
 const res=await fetch("/api/campaigns",{method:"POST",headers,body:JSON.stringify({name:el("campaignName").value,is_test_data:isTest})});
 const data=await res.json();
 if(!res.ok)throw Error(data.error||"Could not create campaign");
 el("campaignType").value=isTest?"test":"normal";
 el("scope").value="mine";
 await refresh();
 el("output").textContent="Created campaign: "+data.name+"\\n"+JSON.stringify(data,null,2);
 el("campaignName").value="";
 el("error").textContent="";
})});
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
// Character tools use ordinary API authorization; no UI-only permission checks.
async function loadCharacters(){
 const campaignId=el("campaignSelect").value;
 if(!campaignId)throw Error("Select a campaign first");
 const d=await request("/api/campaigns/"+encodeURIComponent(campaignId)+"/characters");
 el("characterSelect").replaceChildren(...d.characters.map(c=>new Option(c.name+" ("+c.players+" players)",c.id)));
 el("characterDetails").textContent=d.characters.length+" accessible characters in selected campaign.";
 await loadAssignablePlayers(campaignId);
}
async function loadAssignablePlayers(campaignId){
 const d=await request("/api/campaigns/"+encodeURIComponent(campaignId)+"/members");
 el("assignedPlayer").replaceChildren(...d.members.map(m=>new Option(m.display_name,m.id)));
}
el("campaignSelect").addEventListener("change",()=>{
 el("characterSelect").replaceChildren();el("characterDetails").textContent="";
 el("characterNotes").replaceChildren();el("assignedPlayer").replaceChildren();
});
el("loadCharacters").addEventListener("click",()=>run(loadCharacters));
el("uploadCharacter").addEventListener("submit",e=>{e.preventDefault();run(async()=>{
 let tokens;
 try{tokens=JSON.parse(el("characterTokens").value)}catch{throw Error("Character sheet tokens must be valid JSON")}
 const id=el("campaignSelect").value;
 if(!id)throw Error("Choose a campaign first");
 const d=await request("/api/campaigns/"+encodeURIComponent(id)+"/characters","POST",
 {name:el("characterName").value,character_sheet_tokens:tokens});
 await loadCharacters();el("characterSelect").value=d.id;el("characterName").value="";
})});
el("viewCharacter").addEventListener("click",()=>run(async()=>{
 const id=el("characterSelect").value;if(!id)throw Error("Choose a character");
 const d=await request("/api/characters/"+encodeURIComponent(id));
 el("characterDetails").textContent=JSON.stringify(d.character,null,2);
 el("characterDetails").style.whiteSpace="pre-wrap";
}));
el("assignCharacter").addEventListener("submit",e=>{e.preventDefault();run(async()=>{
 const id=el("characterSelect").value;if(!id)throw Error("Choose a character");
 const user=el("assignedPlayer").value;if(!user)throw Error("Choose a campaign member");
 await request("/api/characters/"+encodeURIComponent(id)+"/assign","POST",{user_id:user});
 await loadCharacters();el("characterSelect").value=id;
})});
el("loadNotes").addEventListener("click",()=>run(async()=>{
 const id=el("characterSelect").value;if(!id)throw Error("Choose a character");
 const d=await request("/api/characters/"+encodeURIComponent(id)+"/notes");
 const nodes=d.notes.map(n=>{const p=document.createElement("p");
 p.textContent=n.visibility+" · "+n.author_id+": "+n.body;return p});
 el("characterNotes").replaceChildren(...nodes);
 if(!nodes.length)el("characterNotes").textContent="No accessible notes.";
}));
el("addNote").addEventListener("submit",e=>{e.preventDefault();run(async()=>{
 const id=el("characterSelect").value;if(!id)throw Error("Choose a character");
 await request("/api/characters/"+encodeURIComponent(id)+"/notes","POST",
 {visibility:el("noteVisibility").value,body:el("noteText").value});
 el("noteText").value="";el("loadNotes").click();
})});
const urlToken=new URL(location.href).searchParams.get("invite");if(urlToken)el("token").value=urlToken;
run(init);
</script></body></html>`;
