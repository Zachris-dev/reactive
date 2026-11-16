import {VALUES,skillKey,effectiveSkill,assign,remove,newNpc,loadLibrary,saveLibrary,parseLibrary,skillForEngine,libraryTypes,groupedLibrary,copyNpc} from "./model.mjs";
import {GROUPS,MAGIC_ALTERNATIVES} from "./skills.mjs";
import {newGroup,copyGroup,addMembers,subtractMembers,removeMembers,referencesTo,loadGroups,saveGroups} from "./group-model.mjs";
import {groupSidebar,groupEditor} from "./group-ui.mjs";
import {initialEncounter,loadEncounter,saveEncounter,addSide,updateSide,deleteSide,addGroupToSide,addCreatureToSide,removeUnit} from "./encounter-model.mjs";
import {encounterLayout} from "./encounter-ui.mjs";

const root=document.querySelector("#app");
const ICONS=["monster-round","monster-square","monster-point","wolf","bear","horse","human-male","human-female"];
const paths={
 "monster-round":'<path d="M11 15 7 5 4 12 Q3 20 12 24 Q21 20 20 12 L17 5 13 15 M8 17l2-1m4 0 2 1 M10 21q2 2 4 0"/>',
 "monster-square":'<path d="M6 8 2 3 Q1 13 7 12 L7 22 H17 V12 Q23 13 22 3 L18 8 M9 16h1m4 0h1m-5 4h4"/>',
 "monster-point":'<path d="M6 10 3 2 11 8 12 2 14 8 21 2 18 10 19 17 12 24 5 17Z M8 15l3 1m2 0 3-1 M10 19h4"/>',
 "wolf":'<path d="m4 9 1-7 5 5 6-2 5 6-3 4-1 6-7-3-6 1 2-6Z M14 11h1m2 3 3 1"/>',
 "bear":'<path d="M5 9a3 3 0 1 1 5-3 10 10 0 0 1 4 0 3 3 0 1 1 5 3 9 9 0 1 1-14 0Z M8 13h1m6 0h1m-6 4 2-1 2 1-2 2Z"/>',
 "horse":'<path d="m7 23 1-7-4-4 3-9 7 2 4 7-1 5 2 6 M7 3 4 2 3 7 M12 11h1 M8 16l7 1"/>',
 "human-male":'<circle cx="11" cy="8" r="5"/><path d="M6 6 8 2 13 3 16 6 M3 24V19q0-6 8-6t8 6v5 M19 3v17m-3-14 3-3 3 3 M7 9h1m5 0h1"/>',
 "human-female":'<circle cx="11" cy="8" r="5"/><path d="M6 6 8 2 14 3 17 11 15 15 M3 24v-5q0-6 8-6t8 6v5 M20 2v22m-3-19 3-3 3 3 M7 9h1m5 0h1"/>'
};
function icon(id,color){ return '<svg viewBox="0 0 24 26" role="img" aria-label="'+esc(id)+'" fill="none" stroke="'+esc(color)+'" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">'+(paths[id]||paths["monster-round"])+'</svg>'; }
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
let npcs=[];
let encounterGroups=[];
let encounter=initialEncounter();
let groupsCollapsed=false;
let creaturesCollapsed=false;
let tab="creatures";
let currentGroupId=null;
let selectedMemberId=null;
let currentId=null;
let selectedValue=20;
let selectedTarget=null;
let typeFilter="";
let notice="";
let error=false;
try{npcs=loadLibrary(localStorage);}catch(e){notice="Stored library could not be read. Import a backup or export the damaged browser data before creating new creatures: "+e.message;error=true;}
const selected=()=>npcs.find(n=>n.id===currentId);
const selectedGroup=()=>encounterGroups.find(g=>g.id===currentGroupId);
function makeId(prefix){return globalThis.crypto?.randomUUID?.()||prefix+"-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
try{encounterGroups=loadGroups(localStorage,npcs);currentGroupId=encounterGroups[0]?.id||null;}catch(e){notice="Could not load groups: "+e.message;error=true;}
try{encounter=loadEncounter(localStorage,npcs);}catch(e){notice="Could not load encounter: "+e.message;error=true;}
function persist(){try{saveLibrary(localStorage,npcs);notice="Saved locally";error=false;return true;}catch(e){notice="Local save failed: "+e.message;error=true;return false;}}
function mutate(fn){const before=JSON.stringify(npcs);fn();if(!persist())npcs=JSON.parse(before);render();}
function persistGroups(){
 try{saveGroups(localStorage,encounterGroups,npcs);notice="Groups saved locally";error=false;return true;}
 catch(e){notice="Group save failed: "+e.message;error=true;return false;}
}
function mutateGroups(fn){
 const before=structuredClone(encounterGroups);
 fn();
 if(!persistGroups())encounterGroups=before;
 render();
}
function createGroup(){
 const id=makeId("group");
 mutateGroups(()=>{encounterGroups.push(newGroup(id));currentGroupId=id;selectedMemberId=null;});
}
function duplicateGroup(){
 const source=selectedGroup();if(!source)return;
 const duplicate=copyGroup(source,makeId("group"));
 mutateGroups(()=>{encounterGroups.push(duplicate);currentGroupId=duplicate.id;selectedMemberId=null;});
}
function updateGroup(fn){
 const current=selectedGroup();if(!current)return;
 mutateGroups(()=>{encounterGroups=encounterGroups.map(g=>g.id===current.id?fn(g):g);});
}
function addToGroup(npcId,count=1){
 if(!selectedGroup()||!npcs.some(n=>n.id===npcId))return;
 selectedMemberId=npcId;
 updateGroup(g=>addMembers(g,npcId,count));
}
function mutateEncounter(fn){
 const before=structuredClone(encounter);
 try{
  const updated=fn(encounter);
  saveEncounter(localStorage,updated,npcs);
  encounter=updated;notice="Encounter saved locally";error=false;
 }catch(e){encounter=before;notice="Encounter update failed: "+e.message;error=true;}
 render();
}
function addEncounterSource(sideId,kind,id){
 const source=kind==="group"?encounterGroups.find(g=>g.id===id):npcs.find(n=>n.id===id);
 if(!source)return;
 const unitId=makeId("encounter-unit");
 mutateEncounter(e=>kind==="group"?addGroupToSide(e,sideId,source,unitId):addCreatureToSide(e,sideId,source,unitId));
}
function create(){const id=(globalThis.crypto?.randomUUID?.()||"npc-"+Date.now()+"-"+Math.random().toString(36).slice(2));const npc=newNpc(id);mutate(()=>{npcs.push(npc);currentId=id;});}
function newCopy(){
 const source=selected();
 if(!source)return;
 const id=(globalThis.crypto?.randomUUID?.()||"npc-"+Date.now()+"-"+Math.random().toString(36).slice(2));
 const duplicate=copyNpc(source,id);
 mutate(()=>{npcs.push(duplicate);currentId=id;typeFilter="";selectedTarget=null;});
}
function updateSelected(fn){
 const npc=selected();if(!npc)return;
 mutate(()=>{const idx=npcs.findIndex(n=>n.id===npc.id);npcs[idx]=fn(npc);});
}
function targetInfo(el){return {kind:el.dataset.kind,key:el.dataset.key};}
function applyValue(kind,key,value){
 if(kind==="group" && value===0){
   notice="Zero is an explicit individual skill override. To clear a group default, use ×.";
   error=false;render();return;
 }
 updateSelected(n=>assign(n,kind,key,value));
}
function removeValue(kind,key){updateSelected(n=>remove(n,kind,key));}
function availableGroups(npc){return GROUPS.map(g=>({...g,skills:g.name==="Magic"?(MAGIC_ALTERNATIVES[npc.magicChoice||"Arcane"]):g.skills}));}
function render(){
 const npc=selected();
 const types=libraryTypes(npcs);
 if(typeFilter && !types.includes(typeFilter))typeFilter="";
 const sections=groupedLibrary(npcs,typeFilter);
 root.innerHTML='<header><div><h1>Reactive · GM App</h1><small>Offline creature and group planning</small></div><nav class="tabs"><button data-action="tab-creatures" class="'+(tab==="creatures"?"active":"")+'">Creature Creator</button><button data-action="tab-groups" class="'+(tab==="groups"?"active":"")+'">Group Planner</button><button data-action="tab-encounter" class="'+(tab==="encounter"?"active":"") +'">Encounter</button></nav><span class="status '+(error?'error':'')+'" role="status">'+esc(notice||"Ready")+'</span></header>'+
 (tab==="encounter"?encounterLayout(encounter,encounterGroups,npcs,icon,esc,{groupsCollapsed,creaturesCollapsed}):'<div class="layout"><aside class="panel sidebar">'+(tab==="groups"?groupSidebar(encounterGroups,currentGroupId,esc,npcs,icon):"")+'<h2>Creatures ('+npcs.length+')</h2><div class="tools">'+(tab==="creatures"?'<button data-action="new">+ New</button><button data-action="copy" '+(npc?'':'disabled title="Select a creature to copy"')+'>New Copy</button><button data-action="export">Export</button><button data-action="import">Import</button>':'<small>Drag or double-click a creature to add it to the active group.</small>')+'</div><input id="import-file" type="file" accept=".json,application/json" hidden />'+
 '<label class="type-filter-label">Show type <select id="type-filter"><option value="">All types</option>'+types.map(t=>'<option value="'+esc(t)+'" '+(typeFilter===t?'selected':'')+'>'+esc(t)+'</option>').join("")+'</select></label>'+
 '<label class="type-filter-label">Jump to <select id="type-jump"><option value="">Choose a section</option>'+sections.map((section,i)=>'<option value="'+i+'">'+esc(section.type||"Unclassified")+'</option>').join("")+'</select></label>'+
 '<div class="creature-list">'+sections.map((section,i)=>'<section class="creature-section" id="type-section-'+i+'"><h3>'+esc(section.type||"Unclassified")+' <small>('+section.creatures.length+')</small></h3>'+section.creatures.map(n=>'<button class="creature '+(currentId===n.id?'selected':'')+'" data-action="select" data-id="'+esc(n.id)+'"><span class="mini">'+icon(n.icon,n.color)+'</span><span>'+esc(n.name||"Unnamed")+'</span></button>').join("")+'</section>').join("")+'</div>'+
 '</aside><section class="panel editor">'+(tab==="groups"?groupEditor(selectedGroup(),npcs,icon,esc,selectedMemberId):npc?renderNpc(npc):'<h2>No creature selected</h2><p class="help">Choose New to create your first NPC or monster. All assigned skill values are optional.</p>')+'</section></div>');
 if(tab==="encounter"){
  document.querySelectorAll(".encounter-source").forEach(el=>{
   el.addEventListener("dragstart",event=>{
    event.dataTransfer.setData("application/x-reactive-encounter",JSON.stringify({kind:el.dataset.kind,id:el.dataset.id}));
    event.dataTransfer.effectAllowed="copy";
   });
  });
  document.querySelectorAll(".encounter-side-drop").forEach(el=>{
   el.addEventListener("dragover",event=>{if(event.dataTransfer.types.includes("application/x-reactive-encounter"))event.preventDefault();});
   el.addEventListener("drop",event=>{event.preventDefault();try{
    const source=JSON.parse(event.dataTransfer.getData("application/x-reactive-encounter"));
    if(["group","creature"].includes(source.kind))addEncounterSource(el.dataset.sideId,source.kind,source.id);
   }catch(e){notice="Unrecognized dropped item";error=true;render();}});
  });
 }
 if(tab==="groups"){
  document.querySelectorAll(".creature").forEach(el=>{
   el.draggable=true;
   el.addEventListener("dragstart",event=>{event.dataTransfer.setData("application/x-reactive-creature",el.dataset.id);event.dataTransfer.effectAllowed="copy";});
  });
  const drop=document.querySelector(".group-drop");
  if(drop){
   drop.addEventListener("dragover",event=>{if(event.dataTransfer.types.includes("application/x-reactive-creature"))event.preventDefault();});
   drop.addEventListener("drop",event=>{event.preventDefault();const id=event.dataTransfer.getData("application/x-reactive-creature");if(id)addToGroup(id);});
  }
 }
 document.querySelectorAll(".value").forEach(b=>{b.draggable=true;b.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",b.dataset.value);e.dataTransfer.effectAllowed="copy";});});
 document.querySelectorAll(".target").forEach(el=>{el.addEventListener("dragover",e=>e.preventDefault());el.addEventListener("drop",e=>{e.preventDefault();const v=Number(e.dataTransfer.getData("text/plain"));if(VALUES.includes(v))applyValue(el.dataset.kind,el.dataset.key,v);});});
}
function renderNpc(npc){
 const groups=availableGroups(npc);
 return (referencesTo(encounterGroups,npc.id).length?'<p class="reference-warning">Used by '+referencesTo(encounterGroups,npc.id).length+' saved group(s). Changes here update all of them. Use <strong>New Copy</strong> to make an independent variant.</p>':'')+
 '<div class="tools"><button data-action="delete" class="warn">Delete creature</button></div>'+
 '<div class="fields"><label>Name<input data-field="name" value="'+esc(npc.name)+'" maxlength="100"></label>'+
 '<label>Creature type<input data-field="type" list="creature-types" placeholder="e.g. Goblins" value="'+esc(npc.type||"")+'" maxlength="100"><datalist id="creature-types">'+libraryTypes(npcs).map(t=>'<option value="'+esc(t)+'"></option>').join("")+'</datalist></label>'+
 '<label>Marker color<input data-field="color" type="color" value="'+esc(npc.color)+'"></label>'+
 '<label class="wide">Short description<textarea data-field="description">'+esc(npc.description)+'</textarea></label></div>'+
 '<h2>Marker icon</h2><div class="icons">'+ICONS.map(i=>'<button class="icon-pick '+(npc.icon===i?'active':'')+'" data-action="icon" data-icon="'+i+'" title="'+esc(i)+'">'+icon(i,npc.color)+'</button>').join("")+'</div>'+
 '<div class="palette"><strong>Skill values · unlimited</strong><p class="help">Select a value, then click or drag it onto a group or skill. 0 explicitly overrides an individual skill; use × to remove an assignment and restore inheritance. Individual values always replace group defaults.</p><div class="values">'+VALUES.map(v=>'<button class="value '+(selectedValue===v?'active':'')+'" data-action="value" data-value="'+v+'">'+v+'</button>').join("")+'</div></div>'+
 '<div class="groups">'+groups.map(g=>renderGroup(npc,g)).join("")+'</div>';
}
function renderGroup(npc,g){
 const assigned=Object.prototype.hasOwnProperty.call(npc.groups,g.name);
 const groupValue=assigned?npc.groups[g.name]:0;
 const groupTarget='group|'+g.name;
 const groupTitle=g.name==="Magic"?'<label>Magic <select data-field="magicChoice">'+Object.keys(MAGIC_ALTERNATIVES).map(v=>'<option '+((npc.magicChoice||"Arcane")===v?'selected':'')+'>'+esc(v)+'</option>').join("")+'</select></label>':'<strong>'+esc(g.name)+'</strong>';
 return '<div class="group"><div class="group-header">'+groupTitle+'<div class="group-controls"><button class="target '+(selectedTarget===groupTarget?'selected-target':'')+'" data-kind="group" data-key="'+esc(g.name)+'" title="Assign group value"><span class="score">'+groupValue+'</span></button>'+(assigned?'<button class="clear" data-action="clear" data-kind="group" data-key="'+esc(g.name)+'" title="Remove group value">×</button>':'')+'</div></div>'+
 g.skills.map(skill=>{const key=skillKey(g.name,skill);const assigned=Object.prototype.hasOwnProperty.call(npc.skills,key);const value=effectiveSkill(npc,g.name,skill);return '<div class="skill"><span>'+esc(skill)+'</span><span class="group-controls"><button class="target '+(assigned?'overridden ':'')+(selectedTarget==='skill|'+key?'selected-target':'')+'" data-kind="skill" data-key="'+esc(key)+'" title="Assign skill value"><span class="score">'+value+'</span></button>'+(assigned?'<small class="tag">override</small><button class="clear" data-action="clear" data-kind="skill" data-key="'+esc(key)+'" title="Remove individual override">×</button>':'')+'</span></div>';}).join("")+'</div>';
}
root.addEventListener("click",e=>{
 const el=e.target.closest("button");if(!el)return;
 const a=el.dataset.action;
 if(a==="tab-creatures"){tab="creatures";render();return;}
 if(a==="tab-encounter"){tab="encounter";render();return;}
 if(a==="toggle-groups"){groupsCollapsed=!groupsCollapsed;render();return;}
 if(a==="toggle-creatures"){creaturesCollapsed=!creaturesCollapsed;render();return;}
 if(a==="encounter-new-side"){mutateEncounter(e=>addSide(e,makeId("side")));return;}
 if(a==="encounter-delete-side"){
  if(!confirm("Remove this side from the encounter?"))return;
  mutateEncounter(e=>deleteSide(e,el.dataset.id));return;
 }
 if(a==="encounter-remove-unit"){
  mutateEncounter(e=>removeUnit(e,el.dataset.sideId,el.dataset.id));return;
 }

 if(a==="tab-groups"){tab="groups";render();return;}
 if(a==="group-new")return createGroup();
 if(a==="group-copy")return duplicateGroup();
 if(a==="group-select"){currentGroupId=el.dataset.id;selectedMemberId=null;render();return;}
 if(a==="group-delete"){
   if(!selectedGroup()||!confirm("Delete this saved group?"))return;
   mutateGroups(()=>{encounterGroups=encounterGroups.filter(g=>g.id!==currentGroupId);currentGroupId=encounterGroups[0]?.id||null;selectedMemberId=null;});
   return;
 }
 if(a==="member-select"){selectedMemberId=el.dataset.id;render();return;}
 if(a==="member-add"){if(selectedMemberId)addToGroup(selectedMemberId,Number(el.dataset.count));return;}
 if(a==="member-subtract"){
  if(!selectedMemberId)return;
  const id=selectedMemberId;
  const count=Number(el.dataset.count);
  const group=selectedGroup();
  if(!group)return;
  const current=group.members.find(m=>m.npcId===id);
  if(!current)return;
  if(current.count<=count)selectedMemberId=null;
  updateGroup(g=>subtractMembers(g,id,count));
  return;
 }
 if(a==="member-remove"){if(!selectedMemberId)return;const id=selectedMemberId;selectedMemberId=null;updateGroup(g=>removeMembers(g,id));return;}
 if(a==="new")return create();
 if(a==="copy")return newCopy();
 if(a==="select"){
   if(tab==="groups"){return;}
   currentId=el.dataset.id;selectedTarget=null;return render();
 }
 if(a==="value"){selectedValue=Number(el.dataset.value);if(selectedTarget){const [kind,...key]=selectedTarget.split("|");applyValue(kind,key.join("|"),selectedValue);}else render();return;}
 if(a==="icon")return updateSelected(n=>({...n,icon:el.dataset.icon}));
 if(a==="clear")return removeValue(el.dataset.kind,el.dataset.key);
 if(a==="delete"){
  const used=referencesTo(encounterGroups,currentId);
  if(used.length){notice="Cannot delete this creature: used by "+used.length+" saved group(s). Remove those references first.";error=true;render();return;}
  if(confirm("Delete this creature? Export a backup first if needed."))mutate(()=>{npcs=npcs.filter(n=>n.id!==currentId);currentId=npcs[0]?.id||null;});return;
 }
 if(a==="export"){const blob=new Blob([JSON.stringify(npcs,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="reactive-gm-creatures.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(a==="import"){document.querySelector("#import-file").click();return;}
 if(el.classList.contains("target")){selectedTarget=el.dataset.kind+"|"+el.dataset.key;applyValue(el.dataset.kind,el.dataset.key,selectedValue);}
});
root.addEventListener("change",async e=>{
 const el=e.target;
 if(el.id==="import-file"){const file=el.files?.[0];if(!file)return;try{const imported=parseLibrary(await file.text());if(encounterGroups.some(g=>g.members.some(m=>!imported.some(n=>n.id===m.npcId))))throw Error("Import would break saved group references. Remove affected groups first.");if(confirm("Replace current local creature library with "+imported.length+" imported creatures?"))mutate(()=>{npcs=imported;currentId=npcs[0]?.id||null;});}catch(err){notice=err.message;error=true;render();}el.value="";return;}
 if(el.dataset.groupField){return;}
 if(el.dataset.sideStatus){
  mutateEncounter(e=>updateSide(e,el.dataset.sideStatus,{status:el.value}));return;
 }
 if(el.dataset.sideName){return;}
 if(el.id==="type-filter"){typeFilter=el.value;render();return;}
 if(el.id==="type-jump"){const target=document.getElementById("type-section-"+el.value);target?.scrollIntoView({block:"nearest",behavior:"smooth"});el.value="";return;}
 if(el.dataset.field==="magicChoice"){updateSelected(n=>({...n,magicChoice:el.value}));return;}
 if(el.dataset.field){const field=el.dataset.field;updateSelected(n=>({...n,[field]:field==="type"?el.value.trim():el.value}));}
});
root.addEventListener("dblclick",e=>{if(tab!=="groups")return;const creature=e.target.closest(".creature");if(creature&&selectedGroup())addToGroup(creature.dataset.id);});
root.addEventListener("input",e=>{
 const el=e.target;
 if(el.matches("input[data-side-name]")){
  try{
   const updated=updateSide(encounter,el.dataset.sideName,{name:el.value});
   saveEncounter(localStorage,updated,npcs);
   encounter=updated;notice="Encounter saved locally";error=false;
  }catch(e){notice="Encounter save failed: "+e.message;error=true;}
  return;
 }
 if(el.matches("input[data-group-field=name],textarea[data-group-field=notes]")){
   const group=selectedGroup();if(!group)return;
   const before=structuredClone(encounterGroups);
   group[el.dataset.groupField]=el.value;
   if(!persistGroups())encounterGroups=before;
   if(el.dataset.groupField==="name"){
     const current=document.querySelector(".group-option.active");
     if(current)current.firstChild.textContent=el.value+" ";
   }
   return;
 }
 if(el.matches("input[data-field=name],textarea[data-field=description]")){const npc=selected();if(!npc)return;const before=JSON.stringify(npcs);npc[el.dataset.field]=el.value;if(!persist())npcs=JSON.parse(before);const entry=document.querySelector('.creature.selected span:last-child');if(entry)entry.textContent=npc.name||"Unnamed";}});
if(npcs.length)currentId=npcs[0].id;
render();
if("serviceWorker" in navigator && location.protocol!=="file:"){navigator.serviceWorker.register("./sw.js").catch(()=>{});}
