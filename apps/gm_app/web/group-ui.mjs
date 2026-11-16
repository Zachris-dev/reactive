export function groupSidebar(groups,activeId,esc,npcs=[],icon=()=>"" ){
 const byId=new Map(npcs.map(n=>[n.id,n]));
 return '<section class="group-picker"><h2>Saved groups ('+groups.length+')</h2><div class="tools"><button data-action="group-new">+ New</button><button data-action="group-copy" '+(activeId?'':'disabled')+'>New Copy</button><button data-action="group-delete" class="warn" '+(activeId?'':'disabled')+'>Delete</button></div>'+
 groups.map(g=>{
  const total=g.members.reduce((n,m)=>n+m.count,0);
  const preview=g.members.map(m=>{
   const n=byId.get(m.npcId);
   const name=n?.name||"Missing creature";
   return '<span class="group-preview-item" title="'+esc(name)+' ×'+m.count+'"><span class="group-preview-icon">'+(n?icon(n.icon,n.color):'?')+'</span><span class="group-preview-count">×'+m.count+'</span></span>';
  }).join("");
  return '<button class="group-option '+(g.id===activeId?'active':'')+'" data-action="group-select" data-id="'+esc(g.id)+'"><span class="group-option-title">'+esc(g.name||"Unnamed group")+' ('+total+')</span>'+(preview?'<span class="group-preview" aria-label="Group composition">'+preview+'</span>':'')+'</button>';
 }).join("")+'</section>';
}
export function groupEditor(group,npcs,icon,esc,selectedMemberId){
 if(!group)return '<h2>No active group</h2><p>Create a group using + New, then drag creatures into it.</p>';
 const byId=new Map(npcs.map(n=>[n.id,n]));
 const count=group.members.reduce((n,m)=>n+m.count,0);
 return '<div class="fields"><label class="wide">Group name<input data-group-field="name" value="'+esc(group.name)+'"></label><label class="wide">Notes<textarea data-group-field="notes">'+esc(group.notes)+'</textarea></label></div>'+
 '<section class="group-drop"><h2>Group members ('+count+')</h2><p class="help">Drag a creature from the library here, or double-click its icon. Select an icon to change its quantity.</p>'+
 (group.members.length?'<div class="member-grid">'+group.members.map(m=>{
   const n=byId.get(m.npcId);
   const name=n?.name||"Missing creature";
   return '<button class="member-tile '+(selectedMemberId===m.npcId?'active':'')+'" data-action="member-select" data-id="'+esc(m.npcId)+'" title="'+esc(name)+'" aria-label="'+esc(name)+': '+m.count+'"><span class="mini">'+(n?icon(n.icon,n.color):'!')+'</span><strong>×'+m.count+'</strong></button>';
 }).join("")+'</div>':'<p class="empty-group">Drop creatures here</p>')+'</section>'+
 '<section class="member-controls"><strong>Selected creature: '+esc(byId.get(selectedMemberId)?.name||"None")+'</strong><div class="tools">'+[1,3,5,9,19].map(v=>'<button data-action="member-add" data-count="'+v+'" '+(selectedMemberId?'':'disabled')+'>+'+v+'</button>').join("")+[1,10].map(v=>'<button data-action="member-subtract" data-count="'+v+'" '+(selectedMemberId?'':'disabled')+'>−'+v+'</button>').join("")+'<button data-action="member-remove" '+(selectedMemberId?'':'disabled')+'>Remove all</button></div></section>';
}
