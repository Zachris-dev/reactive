export function encounterLayout(encounter,groups,npcs,icon,esc,{groupsCollapsed=false,creaturesCollapsed=false}={}){
 const byId=new Map(npcs.map(n=>[n.id,n]));
 const groupPanel='<aside class="encounter-library '+(groupsCollapsed?'collapsed':'')+'"><div class="encounter-library-head"><h2>Saved groups</h2><button data-action="toggle-groups" aria-expanded="'+!groupsCollapsed+'">'+(groupsCollapsed?'Show':'Hide')+'</button></div>'+
 (groupsCollapsed?'':'<div class="encounter-library-scroll">'+groups.map(g=>{
  const total=g.members.reduce((n,m)=>n+m.count,0);
  return '<button draggable="true" class="encounter-source" data-kind="group" data-id="'+esc(g.id)+'" title="Drag into a side"><strong>'+esc(g.name||"Unnamed group")+' ('+total+')</strong><span class="encounter-source-preview">'+g.members.map(m=>mini(byId.get(m.npcId),m.count,icon,esc)).join("")+'</span></button>';
 }).join("")+'</div>')+'</aside>';
 const creaturePanel='<aside class="encounter-library '+(creaturesCollapsed?'collapsed':'')+'"><div class="encounter-library-head"><h2>Creatures</h2><button data-action="toggle-creatures" aria-expanded="'+!creaturesCollapsed+'">'+(creaturesCollapsed?'Show':'Hide')+'</button></div>'+
 (creaturesCollapsed?'':'<div class="encounter-library-scroll">'+npcs.map(n=>'<button draggable="true" class="encounter-source" data-kind="creature" data-id="'+esc(n.id)+'" title="Drag into a side"><span class="encounter-creature-marker">'+icon(n.icon,n.color)+'</span><span>'+esc(n.name)+'</span></button>').join("")+'</div>')+'</aside>';
 return '<div class="encounter-layout">'+groupPanel+'<section class="encounter-center"><div class="encounter-toolbar"><h2>Encounter sides</h2><button data-action="encounter-new-side">+ Add side</button></div><p class="help">Drop saved groups or creatures onto any side. Side 1 is reserved for PCs and allies. Reserve sides are excluded from initiative until activated.</p><div class="encounter-sides">'+encounter.sides.map(s=>renderSide(s,byId,icon,esc)).join("")+'</div></section>'+creaturePanel+'</div>';
}
function mini(n,count,icon,esc){
 return '<span class="encounter-mini" title="'+esc(n?.name||"Missing creature")+' ×'+count+'">'+(n?icon(n.icon,n.color):'?')+'<small>×'+count+'</small></span>';
}
function renderSide(s,byId,icon,esc){
 const active=s.status==="active";
 return '<article class="encounter-side '+(active?'':'reserve')+'" data-side-id="'+esc(s.id)+'"><div class="encounter-side-header"><input aria-label="Side name" data-side-name="'+esc(s.id)+'" value="'+esc(s.name)+'"><select aria-label="Side participation" data-side-status="'+esc(s.id)+'"><option value="active" '+(active?'selected':'')+'>Active</option><option value="reserve" '+(!active?'selected':'')+'>Reserve</option></select>'+(s.id==="side-1"?'<span class="side-pc-label">PC side</span>':'<button data-action="encounter-delete-side" data-id="'+esc(s.id)+'" title="Remove side">Remove</button>')+'</div><div class="encounter-side-drop" data-side-id="'+esc(s.id)+'">'+(s.id==="side-1"?'<div class="pc-placeholder">PC party — character sheet integration pending</div>':'')+
 (s.units.length?s.units.map(u=>'<div class="encounter-unit"><div class="encounter-unit-header"><strong>'+esc(u.name)+'</strong><button data-action="encounter-remove-unit" data-side-id="'+esc(s.id)+'" data-id="'+esc(u.id)+'" title="Remove encounter entry">×</button></div><div class="encounter-source-preview">'+u.members.map(m=>mini(byId.get(m.npcId),m.count,icon,esc)).join("")+'</div></div>').join(""):'<div class="encounter-empty">Drop groups or creatures here</div>')+'</div></article>';
}
