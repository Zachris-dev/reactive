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
const definitions = groups.map(group=>({
 ...group,
 skills: group.skills ? split(group.skills) : undefined,
 subgroups: group.subgroups?.map(s=>({...s,skills:split(s.skills)})),
 alternatives: group.alternatives?.map(a=>({...a,skills:split(a.skills)}))
}));
const root=document.querySelector("#app");
const savedMode=localStorage.getItem("reactive-sheet-value-format");
let valueFormat=savedMode==="decimal"?"decimal":"integer";
let magicChoice="Arcane";
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function cleanName(name){return name.replace(/\s*\([^)]*\)/g,"").trim();}
function skillRows(skills, subgroup=""){
 return skills.map(skill=>`<div class="skill ${subgroup ? "subgroup-skill" : ""}" data-subgroup="${escapeHtml(subgroup)}" data-skill="${escapeHtml(cleanName(skill.name))}" title="${escapeHtml([subgroup ? "Subcategory " + subgroup : "", skill.description].filter(Boolean).join(" — ") || skill.name)}">
 <span class="skill-name">${escapeHtml(skill.name)}</span><span class="skill-value" aria-label="Unassigned">—</span></div>`).join("");
}
function activeSkills(group){
 if(group.alternatives)return group.alternatives.find(a=>a.name===magicChoice).skills;
 if(group.subgroups)return group.subgroups.flatMap(s=>s.skills);
 return group.skills;
}
function renderGroup(group){
 const list=activeSkills(group);
 const valid=list.length===10;
 let content="";
 if(group.alternatives){
  content+=`<div class="magic-picker"><label for="magic-choice">Magic type</label><select id="magic-choice">${group.alternatives.map(a=>`<option value="${escapeHtml(a.name)}" ${a.name===magicChoice?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}</select></div>`;
 }
 if(group.subgroups)content+=group.subgroups.map((s,i)=>`<div class="subgroup-block subgroup-tone-${i%2}">${skillRows(s.skills,s.name)}</div>`).join("");
 else content+=skillRows(list);
 const problem=!valid?`<div class="diagnostic" role="status">${escapeHtml(group.name)} contains ${list.length} skills; exactly 10 required.</div>`:"";
 return `<section class="group ${valid?"":"invalid"}" aria-label="${escapeHtml(group.name)}">
 <div class="group-title"><h2>${escapeHtml(group.name)}</h2><span class="count">${list.length} / 10</span></div>
 <div class="group-main">${content}</div>${problem}</section>`;
}
function render(){
 const invalid=definitions.filter(g=>activeSkills(g).length!==10);
 root.innerHTML=`<div class="app"><header class="top"><div><h1>Character skills</h1><p class="subtitle">The Eldrich Race · Reactive</p></div>
 <div class="tools"><label for="value-format">Skill display</label><select id="value-format"><option value="integer" ${valueFormat==="integer"?"selected":""}>40</option><option value="decimal" ${valueFormat==="decimal"?"selected":""}>4.0</option></select></div></header>
 <div class="summary">12 categories · ${invalid.length===0?"Skill list structurally valid":`${invalid.length} category issue${invalid.length===1?"":"s"} in source skill list`} · Unassigned values shown as —</div>
 <div class="skills">${definitions.map(renderGroup).join("")}</div>
 <p class="notes">Skill descriptions are reserved in the data model. This is the listing panel; character allocations, category bonuses and campaign-specific changes will be connected separately.</p></div>`;
 document.querySelector("#magic-choice").addEventListener("change",event=>{magicChoice=event.target.value;render();});
 document.querySelector("#value-format").addEventListener("change",event=>{valueFormat=event.target.value;localStorage.setItem("reactive-sheet-value-format",valueFormat);render();});
}
render();
