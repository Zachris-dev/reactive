import {parseSkillList,parseCampaign,validateCampaign} from "./template-parser.js";
import {selectionRules,buildCultureOptions,optionAvailable,selectionIssues} from "./selection-rules.js";
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
function skillRows(skills, subgroup=""){
 return skills.map(skill=>`<div class="skill ${subgroup ? "subgroup-skill" : ""}" data-subgroup="${escapeHtml(subgroup)}" data-skill="${escapeHtml(cleanName(skill.name))}" title="${escapeHtml([subgroup ? "Subcategory " + subgroup : "", skill.description].filter(Boolean).join(" — ") || skill.name)}">
 <span class="skill-name">${escapeHtml(skill.name)}</span><span class="skill-value" aria-label="Unassigned">—</span></div>`).join("");
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

 if(group.subgroups)content+=group.subgroups.map((s,i)=>`<div class="subgroup-block subgroup-tone-${i%2}">${skillRows(s.skills,s.name)}</div>`).join("");
 else content+=skillRows(list);
 const problem=!valid?`<div class="diagnostic" role="status">${escapeHtml(group.name)} contains ${list.length} skills; exactly 10 required.</div>`:"";
 const heading=group.alternatives ? (characterContext.mode==="play" ? `<h2>${escapeHtml(magicChoice)}</h2>` : `<label class="visually-hidden" for="magic-choice">Magic discipline</label><select id="magic-choice" class="magic-heading" aria-label="Magic discipline">${options.map(a=>`<option value="${escapeHtml(a.name)}" ${a.name===magicChoice?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}</select>`) : `<h2>${escapeHtml(group.name)}</h2>`;
 return `<section class="group ${valid?"":"invalid"}" aria-label="${escapeHtml(group.name)}">
 <div class="group-title">${heading}<span class="count">${list.length} / 10</span></div>
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
let templateDiagnostics=[];let loadFailure="";
const isPhone=()=>window.matchMedia("(max-width: 600px)").matches;
function availableOption(group,option){return optionAvailable(campaign,chosen,group,option);}
function readyForSkills(){return selectionIssues(campaign,chosen).length===0;}
function renderCampaignScreen(){
 root.innerHTML=`<div class="app setup-app"><h1>Select campaign</h1><p class="subtitle">Create a new character</p>${loadFailure?`<p class="setup-warning">${escapeHtml(loadFailure)}</p>`:""}${templateDiagnostics.length?`<p class="hint">Campaign validation: ${templateDiagnostics.filter(d=>d.severity==="error").length} errors, ${templateDiagnostics.filter(d=>d.severity==="warning").length} warnings, ${templateDiagnostics.filter(d=>d.severity==="info").length} notes.</p><details><summary>Validation details</summary>${templateDiagnostics.map(d=>`<p class="hint">${escapeHtml(d.severity.toUpperCase())} · ${escapeHtml(d.file)} line ${d.line}: ${escapeHtml(d.message)}</p>`).join("")}</details>`:""}
 ${campaigns.map(c=>`<button class="campaign-card" data-campaign="${escapeHtml(c.id)}">${escapeHtml(c.name)} <span>›</span></button>`).join("")}</div>`;
 root.querySelectorAll("[data-campaign]").forEach(b=>b.addEventListener("click",()=>{
  campaign=campaigns.find(c=>c.id===b.dataset.campaign);chosen={...(campaign.defaultCulture?{culture:campaign.defaultCulture}:{})};expanded={};setupNotice="";screen="setup";render();
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
 <h1>New character</h1><p class="subtitle">${escapeHtml(campaign.name)}</p>
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
   magicChoice=chosen.magic||magicChoice;screen="skills";render();
 });
}
function render(){
 if(screen==="campaign"){renderCampaignScreen();return;}
 if(screen==="setup"){renderSetupScreen();return;}
 const invalid=definitions.filter(g=>activeSkills(g).length!==10);
 root.innerHTML=`<div class="app"><button class="back-button" id="back-setup">‹ Character setup</button><header class="top"><div><h1>Character skills</h1><p class="subtitle">The Eldrich Race · Reactive</p></div>
 <div class="tools"><label for="value-format">Skill display</label><select id="value-format"><option value="integer" ${valueFormat==="integer"?"selected":""}>40</option><option value="decimal" ${valueFormat==="decimal"?"selected":""}>4.0</option></select></div></header>
 <div class="summary">12 categories · ${invalid.length===0?"Skill list structurally valid":`${invalid.length} category issue${invalid.length===1?"":"s"} in source skill list`} · Unassigned values shown as —</div>
 <div class="skills">${definitions.map(renderGroup).join("")}</div>
 <p class="notes">Skill descriptions are reserved in the data model. This is the listing panel; character allocations, category bonuses and campaign-specific changes will be connected separately.</p></div>`;
 document.querySelector("#back-setup").addEventListener("click",()=>{chosen.magic=magicChoice;screen="setup";render();});
 document.querySelector("#magic-choice")?.addEventListener("change",event=>{const group=definitions.find(g=>g.name==="Magic"); if(characterContext.mode!=="play" && availableMagicChoices(group).some(a=>a.name===event.target.value)){magicChoice=event.target.value;chosen.magic=magicChoice;render();}});
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
