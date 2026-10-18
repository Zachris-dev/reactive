import {keyFor,makeAllocationState,remaining} from "./allocation.js";

export const REACTIVE_VERSION="0.88";
export const characterHeader=(campaign,date)=>`Character sheet - Reactive ${REACTIVE_VERSION} - ${campaign} - Created ${date}`;
const plainName=value=>String(value??"").replace(/\s*\([^)]*\)/g,"").trim().toLowerCase();
const skillList=group=>group.alternatives?group.alternatives.flatMap(a=>a.skills):group.subgroups?group.subgroups.flatMap(s=>s.skills):group.skills||[];
function categoryFor(definitions,name){return definitions.find(g=>plainName(g.name)===plainName(name));}
function knownSkill(group,name){return skillList(group).find(s=>plainName(s.name)===plainName(name));}
export function mainCultureFromSkills(state,definitions,fallback=""){
 const group=categoryFor(definitions,"Culture");
 if(!group)return fallback;
 let best=null;
 for(const skill of skillList(group)){
  const base=state.skill[keyFor(group.name,skill.name)]||0;
  const total=base+(state.category[group.name]||0);
  if(base>0&&(!best||total>best.total))best={name:skill.name,total};
 }
 return best?.name||fallback;
}
export function serializeCharacter({campaign,created=new Date().toISOString().slice(0,10),primary={},allocation,definitions,extras={},previous={}}){
 if(!allocation)throw Error("No character allocation to save");
 const skills=definitions.map(group=>{
  const bonus=allocation.category[group.name]||0;
  const previousBlock=(previous.skills||[]).find(b=>plainName(b.category)===plainName(group.name));
  const oldEntries=previousBlock?.skills||[];
  const entries=skillList(group).flatMap(skill=>{
   const base=allocation.skill[keyFor(group.name,skill.name)]||0;
   if(base<=0)return [];
   const old=oldEntries.find(e=>plainName(e.name)===plainName(skill.name));
   return [{...old,name:skill.name,base,xp:old?.xp??0,tp:old?.tp??0}];
  });
  const unknown=oldEntries.filter(entry=>!knownSkill(group,entry.name));
  return {...previousBlock,category:group.name,bonus,skills:[...entries,...unknown]};
 });
 return {
  "format":characterHeader(campaign,created),
  "primary":{...previous.primary,...primary,mainCulture:mainCultureFromSkills(allocation,definitions,primary.mainCulture||primary.selectedCulture||"")},
  "skills":[...skills,...(previous.skills||[]).filter(block=>!categoryFor(definitions,block.category))],
  "extra":{
   equipment:[],money:{total:0,coins:[]},contacts:[],notes:[],
   ...previous.extra,...extras
  },
  ...Object.fromEntries(Object.entries(previous).filter(([k])=>!["format","primary","skills","extra"].includes(k)))
 };
}
export function parseCharacterSave(text,expectedCampaign){
 const data=JSON.parse(text);
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Character save must be a JSON object");
 const header=data.format;
 if(typeof header!=="string"||!header.startsWith("Character sheet - Reactive "))throw Error("Not a Reactive character sheet");
 const match=header.match(/^Character sheet - Reactive (\S+) - (.+) - Created (\d{4}-\d{2}-\d{2})$/);
 if(!match)throw Error("Unrecognized Reactive character header");
 if(expectedCampaign&&match[2]!==expectedCampaign)throw Error("Character belongs to campaign "+match[2]+", not "+expectedCampaign);
 if(!Array.isArray(data.skills)||!data.primary||typeof data.primary!=="object")throw Error("Character primary details or skill blocks missing");
 return data;
}
export function restoreCharacterAllocation(data,config,definitions){
 const state=makeAllocationState(config);
 state.category={};state.skill={};
 for(const block of data.skills){
  const group=categoryFor(definitions,block.category);
  if(!group)continue; // keep unknown blocks in the original save document
  if(block.bonus){
   if(!Number.isInteger(block.bonus)||block.bonus<0)throw Error("Invalid bonus in "+block.category);
   state.category[group.name]=block.bonus;
  }
  if(!Array.isArray(block.skills))throw Error("Invalid skill list in "+block.category);
  for(const entry of block.skills){
   const skill=knownSkill(group,entry.name);
   if(!skill)continue; // retain unrecognized skills for future campaigns
   if(!Number.isInteger(entry.base)||entry.base<=0)throw Error("Invalid base skill "+entry.name);
   state.skill[keyFor(group.name,skill.name)]=entry.base;
  }
 }
 if(remaining(state,"category").length+Object.keys(state.category).length!==config.category.length)
  throw Error("Saved category bonus assignments are incompatible with this campaign's creation tokens");
 if(remaining(state,"skill").length+Object.keys(state.skill).length!==config.skill.length+config.initial.length)
  throw Error("Saved skill assignments are incompatible with this campaign's creation tokens");
 return state;
}
