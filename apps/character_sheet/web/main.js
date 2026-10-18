import {listCharacters,loadCharacter,saveCharacter,deleteCharacter,preparedCharacter,newCharacterId} from "./character-library.js";
import {serializeCharacter,parseCharacterSave,restoreCharacterAllocation} from "./character-save.js";
import {parseSkillList,parseCampaign,validateCampaign} from "./template-parser.js";
import {selectionRules,buildCultureOptions,optionAvailable,selectionIssues,optionConflicts,chooseWithOverride} from "./selection-rules.js";
import {testPalette,keyFor,allocationsFromCampaign,makeAllocationState,remaining,assign,remove,humanBodyClassification,skillBase,removeAssignment,allocationRequirements,effectiveSkillValue,cultureRequirementMet,groupThreshold,groupRequirementMet,bodySubgroupsForRace} from "./allocation.js";
// Skill definitions transcribed from The Eldrich Rase Skill list.txt.
// Descriptions are intentionally optional; never invent missing skills.
const groups = [
 {name:"Combat", skills:"Form|Celerity|Precision|Axe/Mace|Spear/Polearm|Sword|Bow|Crossbow|Shield|Unarmed"},
 {name:"Battle", skills:"Steadfastness|Tactics|Formation|Skirmish|Hazard: darkness|Hazard: slippery|Hazard: confined|Ambush|Rally|Awareness"},
 {name:"Athletics", skills:"Throw|Wrestle|Ride|Jump|Swim|Climb|Stalk|Tumble|Boat|Trek"},
 {name:"Body", subgroups:[
  {name:"Strength",skills:"Brawn|Clout|Speed"},
  {name:"Finesse",skills:"Dexterity|Agility|Balance"},
  {name:"Constitution",skills:"Durability|Health|Tenacity"},
  {name:"Senses",skills:"Senses"}
 ]},
 {name:"Social", skills:"Smalltalk|Read Faces|Oration|Nonverbal|Emotional|Logical|Forceful|Personal|Subtle|Humorous"},
 {name:"Artistic", skills:"Sing|Instrument|Compose|Act|Storytell|Author|Dance|Illustrate|Sculpt|Sleight"},
 {name:"Crafting", skills:"Woodwork|Leatherwork|Masonry|Smith|Weave|Tailor|Cook|Brew|Pottery|Artifice"},
 {name:"Mind", skills:"Memory|Reasoning|Wits|Focus|Mental Endurance|Sense of self|Composure|Imagination|Introspection|Intuition"},
 {name:"Nature", skills:"Orienteering|Plants|Birds|Beasts|Fish|Bugs|Traps|Medicines|Surgery|Animal handling"},
 {name:"Magic", alternatives:[
  {name:"Arcane",skills:"Magic Shield|Gather Mana|Purify Mana|Manawell|Movement|Light|Temperature|Echo|Call|Bond"},
  {name:"Divine",skills:"Attunement|Healing|Restoration|Benediction|Divine Protection|Purification|Exorcism|Anchoring|Cursing|Domination"},
  {name:"Druidic",skills:"Borrow Form|Borrow Aspect|Borrow Movement|Borrow Senses|Borrow Vitality|Borrow Instinct|Natural Remedies|Hidden Self|Natural Guard|Swift Change"},
  {name:"Physical Adept",skills:"Battle Aura|Mental Block|Magic Resistance|Ignore Pain|Restore Aura|Sixth Sense|Multi-Focus|Adrenaline Surge|Cleave Magic|Hard to Kill"}
 ]},
 {name:"Culture",skills:"High Emeri|Low Emeri|Herisian|Vaelthar|Seafolk|Kardsworn|Razyg|Emeri nobles|Revangelism|Merchants"},
 {name:"Language",skills:"Emerspeak|Vealan Elvish|Kardish Dwarf|Squall (seafolk)|Vulgar Herisian|Arcane Herisian|Raggyr|Merchant seals bookkeeping|Sacred speech|Old Ennis"}
];
const split = text => text.split("|").map(name => ({name, description:""}));
let definitions = groups.map(group=>({
 ...group,
 skills: group.skills ? split(group.skills) : undefined,
 subgroups: group.subgroups?.map(s=>({...s,skills:split(s.skills)})),
 alternatives: group.alternatives?.map(a=>({...a,skills:split(a.skills)}))
}));
const root=document.querySelector("#app");
const savedMode=localStorage.getItem("reactive-sheet-value-format");
let valueFormat=savedMode==="decimal"?"decimal":"integer";
let magicChoice="Arcane";
let characterName="";
// The character creator will supply race, culture, campaign allowed choices and mode.
// No race/culture is selected in this stand-alone skill-list preview.
const characterContext = {race:null, culture:null, allowedMagic:null, mode:"creation"};
function availableMagicChoices(group){
 return group.alternatives.filter(a=>
   (!characterContext.allowedMagic || characterContext.allowedMagic.includes(a.name)) &&
   !(characterContext.race === "Elf" && a.name === "Physical Adept")
 );
}
function selectableMagicChoice(group){
 const available=availableMagicChoices(group);
 if(!available.some(a=>a.name===magicChoice) && characterContext.mode!=="play"){
   magicChoice=available[0]?.name ?? "";
 }
 return available;
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function cleanName(name){return name.replace(/\s*\([^)]*\)/g,"").trim();}
function skillRows(skills, subgroup="", groupName=""){
 return skills.map(skill=>{
  const target=keyFor(groupName,cleanName(skill.name));
  const placed=allocation?skillBase(allocation,target):undefined;
  const selected=allocation?.selected?.type==="skill"&&allocation.selected.target===target;
  const initial=allocation?.config.initial.some(r=>keyFor(r.group,r.skill)===target);
  const bodyState=groupName==="Body"&&chosen.race?.toLowerCase()==="human"&&allocation?humanBodyClassification(allocation,definitions.find(g=>g.name==="Body")):null;
  const bodyRank=bodyState?.classification[subgroup];
  const ranks={primary:40,secondary:20,tertiary:10};
  const race=String(chosen.race||"").toLowerCase();
  const determined=groupName==="Body" && subgroup && subgroup!=="Senses"
   ?(race==="human"?bodyRank:race==="elf"?{Strength:"secondary",Finesse:"primary",Constitution:"tertiary"}[subgroup]:race==="dwarf"?{Strength:"secondary",Finesse:"tertiary",Constitution:"primary"}[subgroup]:undefined)
   :undefined;
  const sensesRank=groupName==="Body"&&subgroup==="Senses"?(race==="dwarf"?"secondary":"primary"):undefined;
  const rank=determined||sensesRank;
  const max=rank?ranks[rank]+(race==="dwarf"&&rank==="secondary"?10:0):40;
  const result=allocation?effectiveSkillValue(allocation,groupName,cleanName(skill.name),{subgroupLimit:max}):null;
  const tooltip=result?.lost? `Warning: total skill value exceed allowed total. (${result.lost}) base value lost.`:"";
  return `<div class="skill alloc-target ${initial?"initial-skill":""} ${subgroup?"subgroup-skill":""} ${selected?"alloc-selected":""}" tabindex="0" role="button" aria-pressed="${selected}" data-type="skill" data-target="${escapeHtml(target)}" data-subgroup="${escapeHtml(subgroup)}" data-skill="${escapeHtml(cleanName(skill.name))}" title="${escapeHtml(tooltip||[subgroup?"Subcategory "+subgroup:"",skill.description].filter(Boolean).join(" — ")||skill.name)}">
 <span class="skill-name" ${selected?'style="background:#f5e6a6;color:#1c2531;border-radius:4px;padding:3px 6px;font-weight:750"':""}>${escapeHtml(skill.name)}</span>${bodyRank?`<small class="body-rank" title="${bodyRank} Body subgroup">${bodyRank[0].toUpperCase()}</small>`:""}<span class="skill-total" title="Total skill">${result?.base===undefined?"":result.total}</span><span class="skill-value ${result?.lost?"base-loss":""}" title="${escapeHtml(tooltip||"Assigned base value")}" aria-label="${escapeHtml(tooltip||"Base skill value")}">${result?.base===undefined?"":result.base}</span></div>`;
 }).join("");
}
function activeSkills(group){
 if(group.alternatives)return group.alternatives.find(a=>a.name===magicChoice)?.skills ?? [];
 if(group.subgroups)return group.subgroups.flatMap(s=>s.skills);
 return group.skills;
}
function renderGroup(group){
 const options=group.alternatives ? selectableMagicChoice(group) : [];
 const list=activeSkills(group);
 const valid=list.length===10;
 const checkedGroup=group.name==="Culture"||group.name==="Language";
 const threshold=checkedGroup&&allocation?groupThreshold(allocation,group.name):null;
 const requirementInvalid=checkedGroup&&allocation&&!groupRequirementMet(allocation,group.name,list.map(s=>s.name));
 let content="";

 if(group.subgroups)content+=bodySubgroupsForRace(group,chosen.race).map((s,i)=>`<div class="subgroup-block subgroup-tone-${i%2}">${skillRows(s.skills,s.name,group.name)}</div>`).join("");
 else content+=skillRows(list,"",group.name);
 const problem=!valid?`<div class="diagnostic" role="status">${escapeHtml(group.name)} contains ${list.length} skills; exactly 10 required.</div>`:"";
 const bonus=allocation?.category[group.name];
 const categorySelected=allocation?.selected?.type==="category"&&allocation.selected.target===group.name;
 const requirementText=requirementInvalid?`<div class="group-requirement">One total needs to be ${threshold}</div>`:"";
 const heading=group.alternatives ? (characterContext.mode==="play" ? `<h2>${escapeHtml(magicChoice)}</h2>` : `<label class="visually-hidden" for="magic-choice">Magic discipline</label><select id="magic-choice" class="magic-heading" aria-label="Magic discipline">${options.map(a=>`<option value="${escapeHtml(a.name)}" ${a.name===magicChoice?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}</select>`) : `<h2>${escapeHtml(group.name)}</h2>`;
 return `<section class="group ${valid&&!requirementInvalid?"":"invalid"}" aria-label="${escapeHtml(group.name)}">
 <div class="group-title alloc-target ${categorySelected?"alloc-selected":""}" tabindex="0" data-type="category" data-target="${escapeHtml(group.name)}"><span class="category-label" ${categorySelected?'style="background:#f5e6a6;color:#1c2531;border-radius:4px;padding:3px 6px"':""}>${heading}</span><span class="category-bonus">${bonus===undefined?"":"+"+bonus}</span><span class="count">${list.length} / 10</span></div>
 ${requirementText}<div class="group-main">${content}</div>${problem}</section>`;
}

/* Campaign-defined setup data. Load-time parser can replace this object later. */
const campaigns=[{
 id:"the-eldrich-race",name:"The Eldrich Race",
 selections:[
 {id:"culture",label:"Primary culture",required:true,options:[
 {id:"Vaelthar",label:"Vaelthar",barred:true,allowedRaces:["Elf"],languages:["Vaelan Elvish"]},
 {id:"Kardsworn",label:"Kardsworn",barred:true,allowedRaces:["Dwarf"],languages:["Kardish dwarf"]},
 {id:"High Emeri",label:"High Emeri",languages:["Emerspeak"]},
 {id:"Low Emeri",label:"Low Emeri",barred:true,allowedRaces:["Human"],languages:["Emerspeak"]},
 {id:"Herisian",label:"Herisian",barred:true,allowedRaces:["Human","Elf"],languages:["Vulgar Herisian"]},
 {id:"Norr",label:"Norr",barred:true},
 {id:"Razyg",label:"Razyg",barred:true},
 {id:"Emeri Nobles",label:"Emeri Nobles",barred:true,allowedRaces:["Human"],languages:["Emerspeak"]},
 {id:"Revangelism",label:"Revangelism",languages:["Emerspeak"]},
 {id:"Merchants",label:"Merchants",languages:["*"]},
 {id:"Seafolk",label:"Seafolk",languages:["Squall (seafolk)"]}
 ]},
 {id:"race",label:"Race",required:true,options:[
 {id:"Human",label:"Human"}, {id:"Elf",label:"Elf"}, {id:"Dwarf",label:"Dwarf"}
 ]},
 {id:"magic",label:"Magic discipline",required:true,options:[
 {id:"Arcane",label:"Arcane"}, {id:"Divine",label:"Divine"},
 {id:"Druidic",label:"Druidic"}, {id:"Physical Adept",label:"Physical Adept"}
 ]}
 ],
 restrictions:[
 {selection:"race",value:"Elf",disallow:{magic:["Physical Adept"]}}
 ],
 templates:[]
}];
let screen="campaign",campaign=campaigns[0],chosen={},expanded={},setupNotice="";
let currentLibraryId=null;let lastIncompatibleTap=null;let savedCharacterDocument=null;let characterCreated=null;let characterPrimaryDetails={};let templateDiagnostics=[];let loadFailure="";let parsedCampaignData=null;let allocation=null;let allocatedCulture=null;
const isPhone=()=>window.matchMedia("(max-width: 600px)").matches;
function availableOption(group,option){return optionAvailable(campaign,chosen,group,option);}
function readyForSkills(){return selectionIssues(campaign,chosen).length===0;}
function validationReport(){
 const errors=templateDiagnostics.filter(d=>d.severity==="error");
 if(!errors.length)return "";
 return `<section class="setup-warning" role="alert"><strong>Campaign has ${errors.length} validation error(s)</strong><ul>${errors.map(d=>`<li>${escapeHtml(d.file)} line ${d.line}: ${escapeHtml(d.message)}</li>`).join("")}</ul></section>`;
}
function renderCampaignScreen(){
 root.innerHTML=`<div class="app setup-app"><h1>Select campaign</h1><p class="subtitle">Create a new character</p>${validationReport()}${loadFailure?`<p class="setup-warning">${escapeHtml(loadFailure)}</p>`:""}${templateDiagnostics.length?`<p class="hint">Campaign validation: ${templateDiagnostics.filter(d=>d.severity==="error").length} errors, ${templateDiagnostics.filter(d=>d.severity==="warning").length} warnings, ${templateDiagnostics.filter(d=>d.severity==="info").length} notes.</p><details><summary>Validation details</summary>${templateDiagnostics.map(d=>`<p class="hint">${escapeHtml(d.severity.toUpperCase())} · ${escapeHtml(d.file)} line ${d.line}: ${escapeHtml(d.message)}</p>`).join("")}</details>`:""}
 <button id="open-library" class="campaign-card">Character library ›</button>${campaigns.map(c=>`<button class="campaign-card" data-campaign="${escapeHtml(c.id)}">${escapeHtml(c.name)} <span>›</span></button>`).join("")}</div>`;
 root.querySelector("#open-library")?.addEventListener("click",()=>{screen="library";render();});
 root.querySelectorAll("[data-campaign]").forEach(b=>b.addEventListener("click",()=>{
  campaign=campaigns.find(c=>c.id===b.dataset.campaign);allocation=null;allocatedCulture=null;savedCharacterDocument=null;currentLibraryId=null;characterCreated=null;characterPrimaryDetails={};characterName="";chosen={...(campaign.defaultCulture?{culture:campaign.defaultCulture}:{}),...(campaign.defaultRace?{race:campaign.defaultRace}:{})};expanded={};setupNotice="";screen="setup";render();
 }));
}
async function renderLibraryScreen(){
 root.innerHTML='<div class="app setup-app"><button id="library-back">‹ Campaigns</button><h1>Character library</h1><p>Opening local characters…</p></div>';
 try{
  const items=(await listCharacters()).filter(item=>item.campaign===campaign.name);
  root.innerHTML=`<div class="app setup-app"><button id="library-back">‹ Campaigns</button><h1>Character library</h1><p class="hint">Saved in this browser profile. Export JSON to transfer to another device.</p>
   ${items.length?items.map(item=>`<div class="library-entry"><strong>${escapeHtml(item.name)}</strong> <small>Revision ${item.revision} · ${escapeHtml(item.modified)}</small><button data-library-open="${escapeHtml(item.id)}">Open</button><button data-library-delete="${escapeHtml(item.id)}">Delete</button></div>`).join(""):'<p>No locally saved characters for this campaign.</p>'}</div>`;
  root.querySelectorAll("[data-library-open]").forEach(button=>button.addEventListener("click",async()=>{
   try{const data=await loadCharacter(button.dataset.libraryOpen);if(!data)throw Error("Character not found");applyCharacterDocument(parseCharacterSave(JSON.stringify(data),campaign.name));currentLibraryId=data.library?.id||null;screen="skills";render();}catch(error){window.alert(error.message);}
  }));
  root.querySelectorAll("[data-library-delete]").forEach(button=>button.addEventListener("click",async()=>{
   if(!window.confirm("Delete this character from this browser's library?"))return;
   try{await deleteCharacter(button.dataset.libraryDelete);if(currentLibraryId===button.dataset.libraryDelete)currentLibraryId=null;renderLibraryScreen();}catch(error){window.alert(error.message);}
  }));
 }catch(error){root.innerHTML='<div class="app setup-app"><button id="library-back">‹ Campaigns</button><h1>Character library</h1><p role="alert">Unable to access local storage: '+escapeHtml(error.message)+'</p></div>';}
 root.querySelector("#library-back")?.addEventListener("click",()=>{screen="campaign";render();});
}
function applyCharacterDocument(documentData){
 const selectedCulture=documentData.primary.selectedCulture||documentData.primary.mainCulture;
 if(!parsedCampaignData.cultures.some(c=>c.name===selectedCulture))throw Error("Unknown creation culture: "+selectedCulture);
 const newState=restoreCharacterAllocation(documentData,allocationsFromCampaign(parsedCampaignData,selectedCulture),definitions);
 const newRace=documentData.primary.race||chosen.race;
 const newMagic=documentData.primary.magic||chosen.magic||"Arcane";
 if(!campaign.selections.find(g=>g.id==="race").options.some(o=>o.id===newRace))throw Error("Unknown race: "+newRace);
 if(!campaign.selections.find(g=>g.id==="magic").options.some(o=>o.id===newMagic))throw Error("Unknown magic discipline: "+newMagic);
 chosen={culture:selectedCulture,race:newRace,magic:newMagic};
 characterName=documentData.primary.name||"";
 characterPrimaryDetails={...documentData.primary};
 characterCreated=documentData.format.match(/Created (\\d{4}-\\d{2}-\\d{2})$/)?.[1]||null;
 savedCharacterDocument=documentData;allocation=newState;allocatedCulture=selectedCulture;
 magicChoice=newMagic;characterContext.race=newRace;characterContext.culture=selectedCulture;
 currentLibraryId=documentData.library?.id||null;
}
function currentCharacterDocument(){
 if(!characterCreated)characterCreated=new Date().toISOString().slice(0,10);
 return serializeCharacter({campaign:campaign.name,created:characterCreated,
  primary:{...characterPrimaryDetails,name:characterName,race:chosen.race,selectedCulture:chosen.culture,magic:magicChoice,totalXpUsed:characterPrimaryDetails.totalXpUsed||0},
  allocation,definitions,previous:savedCharacterDocument||{}});
}
function renderSetupScreen(){
 const panels=campaign.selections.map(group=>{
  const open=expanded[group.id]??!isPhone();
  const selected=chosen[group.id];
  return `<section class="setup-panel"><button class="setup-accordion" aria-expanded="${open}" data-toggle="${escapeHtml(group.id)}">
    <span>${escapeHtml(group.label)} <small>${escapeHtml(selected||"Not selected")}</small></span><span>${open?"▴":"▾"}</span></button>
    ${open?`<div class="setup-options">${group.options.map(option=>{
      const current=selected===option.id;
      const status=optionConflicts(campaign,chosen,group,option);
      const allowed=availableOption(group,option);
      const blocked=status.barred;
      const reasons=status.conflicts.map(id=>chosen[id]).filter(Boolean).join(", ");
      return `<button type="button" class="setup-option ${allowed?"":blocked?"unavailable barred":"unavailable incompatible"}"
         role="radio" aria-checked="${current}" aria-disabled="${blocked}"
         data-selection="${escapeHtml(group.id)}" data-option="${escapeHtml(option.id)}">
       <span class="setup-radio ${current?"checked":""}" aria-hidden="true"></span>
       <span>${escapeHtml(option.label)}</span>
       ${blocked?"<small>Barred</small>":!allowed?`<small>Incompatible: ${escapeHtml(reasons||chosen.race||chosen.culture||"selection")}</small>`:""}</button>`;
    }).join("")}</div>`:""}
   </section>`;
 }).join("");
 root.innerHTML=`<div class="app setup-app"><button class="back-button" id="back-campaign">‹ Campaigns</button>
 <h1>New character</h1><p class="subtitle">${escapeHtml(campaign.name)}</p>${validationReport()}
 <div class="setup-layout"><div class="setup-selections">${panels}</div>
 <aside class="template-area"><h2>Character templates</h2>
 ${campaign.templates.length?campaign.templates.map(t=>`<button class="template-card" data-template="${escapeHtml(t.id)}">${escapeHtml(t.name)}</button>`).join(""):`<p class="hint">No template characters have been added for this campaign.</p>`}
 <p class="hint">Templates are loaded as independent, editable characters; originals cannot be overwritten.</p></aside></div>
 ${setupNotice?`<p class="setup-warning" role="status">${escapeHtml(setupNotice)}</p>`:""}
 <div class="setup-footer"><button id="open-skills" ${readyForSkills()?"":"disabled"}>Continue to skills →</button></div></div>`;
 root.querySelector("#back-campaign").addEventListener("click",()=>{screen="campaign";render();});
 root.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",()=>{const key=b.dataset.toggle;expanded[key]=!(expanded[key]??!isPhone());render();}));
 root.querySelectorAll("[data-selection]").forEach(button=>button.addEventListener("click",()=>{
  const group=campaign.selections.find(g=>g.id===button.dataset.selection);
  const option=group.options.find(o=>o.id===button.dataset.option);
  const status=optionConflicts(campaign,chosen,group,option);
  if(status.barred)return;
  if(status.conflicts.length){
   const key=group.id+":"+option.id;
   const now=Date.now();
   const doubleTap=lastIncompatibleTap?.key===key&&now-lastIncompatibleTap.time<650;
   lastIncompatibleTap={key,time:now};
   if(!doubleTap){setupNotice="Tap again to select "+option.label+" and clear incompatible selections.";render();return;}
  }
  chosen=chooseWithOverride(campaign,chosen,group,option);
  lastIncompatibleTap=null;setupNotice="";render();
 }));
 root.querySelector("#open-skills").addEventListener("click",()=>{
   if(!readyForSkills())return;
   characterContext.race=chosen.race||null;
   characterContext.culture=chosen.culture||null;
   characterContext.allowedMagic=campaign.selections.find(g=>g.id==="magic")?.options.filter(o=>availableOption({id:"magic"},o)).map(o=>o.id)||null;
   if(allocation&&allocatedCulture===chosen.culture&&magicChoice!==chosen.magic){
    for(const target of Object.keys(allocation.skill)){if(JSON.parse(target)[0]==="magic")remove(allocation,"skill",target);}
   }
   magicChoice=chosen.magic||magicChoice;
   if(!allocation||allocatedCulture!==chosen.culture){
    allocation=makeAllocationState(allocationsFromCampaign(parsedCampaignData,chosen.culture));
    allocatedCulture=chosen.culture;
   }
   screen="skills";render();
 });
}
function renderAllocationTools(){
 if(!allocation)return "";
 const tokens=type=>remaining(allocation,type).map((n,i)=>{
   const selected=allocation.selected?.type===type&&allocation.selected?.token===n;
   return `<button type="button" draggable="true" data-token="${type}" data-value="${n}" class="float-token ${type}-token ${selected?"alloc-selected":""}" title="Unassigned ${type} value ${n}">${n}</button>`;
 }).join("");
 const selected=allocation.selected;
 const placement=selected?.target!==undefined?(selected.type==="skill"?skillBase(allocation,selected.target):allocation[selected.type]?.[selected.target]):undefined;
 return `<section class="allocation-tools" style="--category-token:${testPalette.category};--skill-token:${testPalette.skill}">
 <div class="allocation-pool"><h2>Category bonuses <small>${remaining(allocation,"category").length} remaining</small></h2><div class="token-grid">${tokens("category")}</div></div>
 <div class="allocation-pool"><h2>Skill values <small>${remaining(allocation,"skill").length} remaining</small></h2><div class="token-grid">${tokens("skill")}</div></div>
 <div class="allocation-entry"><label for="allocation-number">Selected target value</label><input id="allocation-number" type="number" min="1" placeholder="Select a category or skill" ${selected?.target===undefined?"disabled":""}><button id="allocation-assign" ${selected?.target===undefined?"disabled":""}>Assign</button><button id="allocation-remove" ${placement===undefined?"disabled":""}>Remove ${placement===undefined?"":"("+placement+")"}</button><p class="hint">${selected?.target!==undefined?escapeHtml(selected.target):selected?.token!==undefined?"Selected "+selected.type+" token: "+selected.token:"Select a token or target"}</p></div>
 </section>`;
}
function chooseToken(type,value){
 if(!allocation)return;
 const selected=allocation.selected;
 if(selected?.type===type&&selected.target!==undefined){
  assign(allocation,type,selected.target,value);allocation.selected={type,target:selected.target};
 }else allocation.selected={type,token:value};
 render();
}
function chooseTarget(type,target){
 if(!allocation)return;

 const selected=allocation.selected;
 if(selected?.type===type&&selected.token!==undefined){
  assign(allocation,type,target,selected.token);allocation.selected={type,target};
 }else allocation.selected={type,target};
 render();
}
function wireAllocation(){
 if(!allocation)return;
 document.querySelectorAll("[data-token]").forEach(btn=>{
  btn.style.setProperty("--category-token",testPalette.category);
  btn.style.setProperty("--skill-token",testPalette.skill);
  btn.addEventListener("click",()=>chooseToken(btn.dataset.token,Number(btn.dataset.value)));
  btn.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",JSON.stringify({type:btn.dataset.token,value:Number(btn.dataset.value)})));
 });
 document.querySelectorAll(".alloc-target").forEach(el=>{
  el.addEventListener("click",e=>{if(e.target.closest("select"))return;chooseTarget(el.dataset.type,el.dataset.target);});
  el.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest("select")){e.preventDefault();chooseTarget(el.dataset.type,el.dataset.target);}});
  el.addEventListener("dragover",e=>e.preventDefault());
  el.addEventListener("drop",e=>{e.preventDefault();try{const item=JSON.parse(e.dataTransfer.getData("text/plain"));if(item.type===el.dataset.type){assign(allocation,item.type,el.dataset.target,item.value);allocation.selected={type:item.type,target:el.dataset.target};render();}}catch{}});
 });
 document.querySelector("#allocation-assign")?.addEventListener("click",()=>{
  const selected=allocation.selected;if(selected?.target===undefined)return;
  const value=Number(document.querySelector("#allocation-number").value);
  if(assign(allocation,selected.type,selected.target,value)){allocation.selected={type:selected.type,target:selected.target};render();}
 });
 document.querySelector("#allocation-number")?.addEventListener("keydown",e=>{if(e.key==="Enter")document.querySelector("#allocation-assign").click();});
 document.querySelector("#allocation-remove")?.addEventListener("click",()=>{
  const selected=allocation.selected;
  if(selected?.target!==undefined){removeAssignment(allocation,selected.type,selected.target);allocation.selected=null;render();}
 });
}
function render(){
 const previousSkillScroll=window.scrollY;
 const previousTokenScroll=root.querySelector(".creation-allocation-scroll")?.scrollTop||0;
 if(screen==="campaign"){renderCampaignScreen();return;}
 if(screen==="setup"){renderSetupScreen();return;}
 if(screen==="library"){renderLibraryScreen();return;}
 const invalid=definitions.filter(g=>activeSkills(g).length!==10);
 const bodyClassification=chosen.race?.toLowerCase()==="human"&&allocation?humanBodyClassification(allocation,definitions.find(g=>g.name==="Body")):null;
 const requirementIssues=allocation?allocationRequirements(allocation,chosen.culture,parsedCampaignData?.cultures.find(c=>c.name===chosen.culture)?.primaryLanguage,activeSkills(definitions.find(g=>g.name==="Culture")).map(s=>s.name),activeSkills(definitions.find(g=>g.name==="Language")).map(s=>s.name)):[];
 root.innerHTML=`<div class="app" style="--category-token:${testPalette.category};--skill-token:${testPalette.skill}"><button class="back-button" id="back-setup">‹ Character setup</button>
 <header class="top"><div class="character-identity"><label for="character-name">Character name</label><input id="character-name" type="text" autocomplete="off" placeholder="Name" value="${escapeHtml(characterName)}"><span class="identity-culture-race">(${escapeHtml(chosen.culture||"")}) (${escapeHtml(chosen.race||"")})</span></div>
 <div class="tools"><button type="button" id="save-local">Save</button><button type="button" id="save-copy">Save Copy</button><button type="button" id="library-from-skills">Library</button><button type="button" id="save-character">Export JSON</button><button type="button" id="load-character">Load JSON</button><input id="character-file" type="file" accept=".json,application/json" hidden><label for="value-format">Skill display</label><select id="value-format"><option value="integer" ${valueFormat==="integer"?"selected":""}>40</option><option value="decimal" ${valueFormat==="decimal"?"selected":""}>4.0</option></select></div></header>
 <details class="testing-information"><summary>Testing information</summary><div class="summary">12 categories · ${invalid.length===0?"Skill list structurally valid":`${invalid.length} category issue(s) in source skill list`}${requirementIssues.length?` · Invalid: ${requirementIssues.map(escapeHtml).join("; ")}`:""}${bodyClassification?.violations.length?` · Body conflicts: ${bodyClassification.violations.map(v=>`${v.subgroup} ${v.max} exceeds ${v.limit}`).join(", ")}`:""}</div></details>
 <div class="creation-workspace"><div class="creation-skill-scroll"><div class="skills">${definitions.map(renderGroup).join("")}</div></div><aside class="creation-allocation-scroll">${renderAllocationTools()}</aside></div>
 <p class="notes">Body subgroup labels P/S/T indicate provisional primary/secondary/tertiary classifications. Initial Culture and Language tokens can be reassigned. Tap a token then a target, or a target then a token.</p></div>`;

 wireAllocation();
 document.querySelector("#save-local")?.addEventListener("click",async()=>{
  try{
   const doc=currentCharacterDocument();
   const id=currentLibraryId||newCharacterId();
   const updated=preparedCharacter(doc,{id});
   await saveCharacter(updated);
   currentLibraryId=id;savedCharacterDocument=updated;
   window.alert("Character saved locally.");
  }catch(error){window.alert("Save failed: "+error.message);}
 });
 document.querySelector("#save-copy")?.addEventListener("click",async()=>{
  try{
   const updated=preparedCharacter(currentCharacterDocument(),{id:newCharacterId()});
   await saveCharacter(updated);currentLibraryId=updated.library.id;savedCharacterDocument=updated;
   window.alert("Saved as a new character in this browser.");
  }catch(error){window.alert("Save copy failed: "+error.message);}
 });
 document.querySelector("#library-from-skills")?.addEventListener("click",()=>{
  if(!window.confirm("Open library? Unsaved edits will be lost unless you saved them first."))return;
  screen="library";render();
 });
 document.querySelector("#save-character")?.addEventListener("click",()=>{
  try{
   if(!characterCreated)characterCreated=new Date().toISOString().slice(0,10);
   const documentData=currentCharacterDocument();
   savedCharacterDocument=documentData;
   const file=new Blob([JSON.stringify(documentData,null,2)+"\\n"],{type:"application/json"});
   const url=URL.createObjectURL(file),link=document.createElement("a");
   link.href=url;link.download=(characterName.trim().replace(/[^a-z0-9_-]+/gi,"_")||"character")+".json";
   document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){window.alert("Unable to save character: "+error.message);}
 });
 document.querySelector("#load-character")?.addEventListener("click",()=>document.querySelector("#character-file")?.click());
 document.querySelector("#character-file")?.addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
   const documentData=parseCharacterSave(await file.text(),campaign.name);
   applyCharacterDocument(documentData);
   // JSON imports do not silently overwrite an existing local character.
   currentLibraryId=null;
   render();
  }catch(error){window.alert("Unable to load character: "+error.message);}
  event.target.value="";
 });
 document.querySelector("#character-name")?.addEventListener("input",event=>{characterName=event.target.value;});
 window.scrollTo(0,previousSkillScroll);
 if(root.querySelector(".creation-allocation-scroll"))root.querySelector(".creation-allocation-scroll").scrollTop=previousTokenScroll;
 document.querySelector("#back-setup").addEventListener("click",()=>{chosen.magic=magicChoice;screen="setup";render();});
 document.querySelector("#magic-choice")?.addEventListener("change",event=>{const group=definitions.find(g=>g.name==="Magic"); if(characterContext.mode!=="play" && availableMagicChoices(group).some(a=>a.name===event.target.value)){if(magicChoice!==event.target.value){for(const target of Object.keys(allocation?.skill||{})){if(JSON.parse(target)[0]==="magic")remove(allocation,"skill",target);}}magicChoice=event.target.value;chosen.magic=magicChoice;render();}});
 document.querySelector("#value-format").addEventListener("change",event=>{valueFormat=event.target.value;localStorage.setItem("reactive-sheet-value-format",valueFormat);render();});
}
async function loadCampaignFiles(){
 try{
  const [campaignResponse,skillsResponse]=await Promise.all([
    fetch("../../../campaigns/the-eldrich-race/campaign.txt"),
    fetch("../../../campaigns/the-eldrich-race/skills.txt")
  ]);
  if(!campaignResponse.ok||!skillsResponse.ok)throw new Error("Campaign files not available (serve from repository root)");
  const parsedCampaign=parseCampaign(await campaignResponse.text());
  parsedCampaignData=parsedCampaign;
  const parsedSkills=parseSkillList(await skillsResponse.text());
  templateDiagnostics=validateCampaign(parsedCampaign,parsedSkills);
  definitions=parsedSkills.categories.map(group=>({
    name:group.name,
    skills:group.skills.length?group.skills:undefined,
    subgroups:group.subgroups.length?group.subgroups:undefined,
    alternatives:group.alternatives.length?group.alternatives:undefined
  }));
  const cultureGroup=campaign.selections.find(s=>s.id==="culture");
  cultureGroup.options=buildCultureOptions(parsedCampaign);
  campaign.defaultCulture=parsedCampaign.cultures.find(c=>c.isDefault)?.name||null;
  campaign.defaultRace=(()=>{const race=parsedCampaign.races.find(r=>r.statements.some(s=>/^Default$/i.test(s.text)));return race?race.name[0].toUpperCase()+race.name.slice(1):null;})();
  const raceGroup=campaign.selections.find(s=>s.id==="race");
  raceGroup.options=parsedCampaign.races.map(r=>({id:r.name[0].toUpperCase()+r.name.slice(1),label:r.name[0].toUpperCase()+r.name.slice(1)}));
  campaign.restrictions=selectionRules(parsedCampaign);
 }catch(error){loadFailure=String(error);}
 render();
}
loadCampaignFiles();
