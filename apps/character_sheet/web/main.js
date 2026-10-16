import {parseSkillList,parseCampaign,validateCampaign} from "./template-parser.js";
import {selectionRules,buildCultureOptions,optionAvailable,selectionIssues} from "./selection-rules.js";
import {testPalette,keyFor,allocationsFromCampaign,makeAllocationState,remaining,assign,remove,humanBodyClassification,skillBase,removeAssignment,allocationRequirements} from "./allocation.js";
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
  return `<div class="skill alloc-target ${initial?"initial-skill":""} ${subgroup?"subgroup-skill":""} ${selected?"alloc-selected":""}" tabindex="0" role="button" aria-pressed="${selected}" data-type="skill" data-target="${escapeHtml(target)}" data-subgroup="${escapeHtml(subgroup)}" data-skill="${escapeHtml(cleanName(skill.name))}" title="${escapeHtml([subgroup?"Subcategory "+subgroup:"",skill.description].filter(Boolean).join(" — ")||skill.name)}">
 <span class="skill-name" ${selected?'style="background:#f5e6a6;color:#1c2531;border-radius:4px;padding:3px 6px;font-weight:750"':""}>${escapeHtml(skill.name)}</span>${bodyRank?`<small class="body-rank" title="${bodyRank} Body subgroup">${bodyRank[0].toUpperCase()}</small>`:""}<span class="skill-value">${placed===undefined?"—":escapeHtml(placed)}</span></div>`;
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
 let content="";

 if(group.subgroups)content+=group.subgroups.map((s,i)=>`<div class="subgroup-block subgroup-tone-${i%2}">${skillRows(s.skills,s.name,group.name)}</div>`).join("");
 else content+=skillRows(list,"",group.name);
 const problem=!valid?`<div class="diagnostic" role="status">${escapeHtml(group.name)} contains ${list.length} skills; exactly 10 required.</div>`:"";
 const bonus=allocation?.category[group.name];
 const categorySelected=allocation?.selected?.type==="category"&&allocation.selected.target===group.name;
 const heading=group.alternatives ? (characterContext.mode==="play" ? `<h2>${escapeHtml(magicChoice)}</h2>` : `<label class="visually-hidden" for="magic-choice">Magic discipline</label><select id="magic-choice" class="magic-heading" aria-label="Magic discipline">${options.map(a=>`<option value="${escapeHtml(a.name)}" ${a.name===magicChoice?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}</select>`) : `<h2>${escapeHtml(group.name)}</h2>`;
 return `<section class="group ${valid?"":"invalid"}" aria-label="${escapeHtml(group.name)}">
 <div class="group-title alloc-target ${categorySelected?"alloc-selected":""}" tabindex="0" data-type="category" data-target="${escapeHtml(group.name)}"><span class="category-label" ${categorySelected?'style="background:#f5e6a6;color:#1c2531;border-radius:4px;padding:3px 6px"':""}>${heading}</span><span class="category-bonus">${bonus===undefined?"—":"+"+bonus}</span><span class="count">${list.length} / 10</span></div>
 <div class="group-main">${content}</div>${problem}</section>`;
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
let templateDiagnostics=[];let loadFailure="";let parsedCampaignData=null;let allocation=null;let allocatedCulture=null;
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
 ${campaigns.map(c=>`<button class="campaign-card" data-campaign="${escapeHtml(c.id)}">${escapeHtml(c.name)} <span>›</span></button>`).join("")}</div>`;
 root.querySelectorAll("[data-campaign]").forEach(b=>b.addEventListener("click",()=>{
  campaign=campaigns.find(c=>c.id===b.dataset.campaign);allocation=null;allocatedCulture=null;chosen={...(campaign.defaultCulture?{culture:campaign.defaultCulture}:{})};expanded={};setupNotice="";screen="setup";render();
 }));
}
function renderSetupScreen(){
 const panels=campaign.selections.map(group=>{
  const open=expanded[group.id]??!isPhone();
  const selected=chosen[group.id];
  return `<section class="setup-panel"><button class="setup-accordion" aria-expanded="${open}" data-toggle="${escapeHtml(group.id)}">
    <span>${escapeHtml(group.label)} <small>${escapeHtml(selected||"Not selected")}</small></span><span>${open?"▴":"▾"}</span></button>
    ${open?`<div class="setup-options">${group.options.map(option=>{
      const allowed=availableOption(group,option);
      const current=selected===option.id;
      return `<label class="setup-option ${allowed?"":"unavailable"}">
       <input type="radio" name="${escapeHtml(group.id)}" value="${escapeHtml(option.id)}" ${current?"checked":""} ${allowed?"":"disabled"}>
       <span>${escapeHtml(option.label)}</span>${allowed?"":"<small>Not available</small>"}</label>`;
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
 root.querySelectorAll('input[type="radio"]').forEach(input=>input.addEventListener("change",()=>{
   chosen[input.name]=input.value;
   setupNotice="";
   // Keep incompatible selections visible as a validation problem, never silently switch.
   const issues=selectionIssues(campaign,chosen);
   if(issues.length)setupNotice=issues.map(issue=>issue.message).join("; ")+". Change the selection to continue.";
   render();
 }));
 root.querySelector("#open-skills").addEventListener("click",()=>{
   if(!readyForSkills())return;
   characterContext.race=chosen.race||null;
   characterContext.culture=chosen.culture||null;
   characterContext.allowedMagic=campaign.selections.find(g=>g.id==="magic")?.options.filter(o=>availableOption({id:"magic"},o)).map(o=>o.id)||null;
   if(allocation&&allocatedCulture===chosen.culture&&magicChoice!==chosen.magic){
    for(const target of Object.keys(allocation.skill)){if(JSON.parse(target)[0]==="Magic")remove(allocation,"skill",target);}
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
 const invalid=definitions.filter(g=>activeSkills(g).length!==10);
 const bodyClassification=chosen.race?.toLowerCase()==="human"&&allocation?humanBodyClassification(allocation,definitions.find(g=>g.name==="Body")):null;
 const requirementIssues=allocation?allocationRequirements(allocation,chosen.culture,parsedCampaignData?.cultures.find(c=>c.name===chosen.culture)?.primaryLanguage):[];
 root.innerHTML=`<div class="app" style="--category-token:${testPalette.category};--skill-token:${testPalette.skill}"><button class="back-button" id="back-setup">‹ Character setup</button><header class="top"><div><h1>Character skills</h1><p class="subtitle">The Eldrich Race · Reactive</p></div>
 <div class="tools"><label for="value-format">Skill display</label><select id="value-format"><option value="integer" ${valueFormat==="integer"?"selected":""}>40</option><option value="decimal" ${valueFormat==="decimal"?"selected":""}>4.0</option></select></div></header>
 <div class="summary">12 categories · ${invalid.length===0?"Skill list structurally valid":`${invalid.length} category issue${invalid.length===1?"":"s"} in source skill list`} · Unassigned values shown as —${requirementIssues.length?` · Invalid: ${requirementIssues.map(escapeHtml).join("; ")}`:""}${bodyClassification?.violations.length?` · Body conflicts: ${bodyClassification.violations.map(v=>`${v.subgroup} ${v.max} exceeds ${v.limit}`).join(", ")}`:""}</div>
 <div class="creation-workspace"><div class="creation-skill-scroll"><div class="skills">${definitions.map(renderGroup).join("")}</div></div><aside class="creation-allocation-scroll">${renderAllocationTools()}</aside></div>
 <p class="notes">Body subgroup labels P/S/T indicate provisional primary/secondary/tertiary classifications. Initial Culture and Language values are assigned from real tokens; removing or replacing them returns those tokens to the pool and may make the character invalid. Tap a token then a matching target, or a target then a token. Drag tokens onto targets. Select an assigned target to remove its value.</p></div>`;
 wireAllocation();
 window.scrollTo(0,previousSkillScroll);
 if(root.querySelector(".creation-allocation-scroll"))root.querySelector(".creation-allocation-scroll").scrollTop=previousTokenScroll;
 document.querySelector("#back-setup").addEventListener("click",()=>{chosen.magic=magicChoice;screen="setup";render();});
 document.querySelector("#magic-choice")?.addEventListener("change",event=>{const group=definitions.find(g=>g.name==="Magic"); if(characterContext.mode!=="play" && availableMagicChoices(group).some(a=>a.name===event.target.value)){if(magicChoice!==event.target.value){for(const target of Object.keys(allocation?.skill||{})){if(JSON.parse(target)[0]==="Magic")remove(allocation,"skill",target);}}magicChoice=event.target.value;chosen.magic=magicChoice;render();}});
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
  const raceGroup=campaign.selections.find(s=>s.id==="race");
  raceGroup.options=parsedCampaign.races.map(r=>({id:r.name[0].toUpperCase()+r.name.slice(1),label:r.name[0].toUpperCase()+r.name.slice(1)}));
  campaign.restrictions=selectionRules(parsedCampaign);
 }catch(error){loadFailure=String(error);}
 render();
}
loadCampaignFiles();
