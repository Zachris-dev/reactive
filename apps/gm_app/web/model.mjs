export const VALUES = Object.freeze([0,...Array.from({length:19}, (_,i)=>(i+1)*5)]);
export const STORAGE_KEY = "reactive-gm-npcs-v1";
const has = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
export function skillKey(group,skill){ return group + "::" + skill; }
export function effectiveSkill(npc, group, skill){
  const key=skillKey(group,skill);
  return has(npc.skills,key) ? npc.skills[key] : (has(npc.groups,group) ? npc.groups[group] : 0);
}
export function assign(npc,kind,key,value){
  if(!VALUES.includes(value) || (kind==="group" && value===0)) throw new Error("Skill values must be 0 through 95 in steps of 5; group defaults use 5 through 95");
  if(kind!=="group" && kind!=="skill") throw new Error("Unknown assignment kind");
  const target=kind==="group"?"groups":"skills";
  return {...npc,[target]:{...npc[target],[key]:value}};
}
export function remove(npc,kind,key){
  if(kind!=="group" && kind!=="skill") throw new Error("Unknown assignment kind");
  const target=kind==="group"?"groups":"skills";
  const entries={...npc[target]}; delete entries[key];
  return {...npc,[target]:entries};
}
export function newNpc(id, name="New creature"){
  return {id,creationMode:"gm",name,type:"",description:"",icon:"monster-round",color:"#80b7db",groups:{},skills:{}};
}
/** Duplicate a creature as an independent record, retaining all creator settings. */
export function copyNpc(source,newId){
  if(!validateNpc(source)) throw new Error("Cannot copy an invalid GM creature");
  if(typeof newId!=="string" || !newId || newId===source.id) throw new Error("The copied creature requires a new ID");
  return {...structuredClone(source),id:newId};
}
function validEntries(entries,allowZero=false){
  return entries && typeof entries==="object" && !Array.isArray(entries) &&
    Object.entries(entries).every(([key,value])=>typeof key==="string" && key.length>0 && VALUES.includes(value) && (allowZero || value!==0));
}
export function validateNpc(npc){
  return !!npc && typeof npc==="object" && npc.creationMode==="gm" &&
    typeof npc.id==="string" && !!npc.id &&
    typeof npc.name==="string" && (npc.type===undefined || typeof npc.type==="string") && typeof npc.description==="string" &&
    typeof npc.icon==="string" && typeof npc.color==="string" &&
    validEntries(npc.groups) && validEntries(npc.skills,true);
}
export function parseLibrary(raw){
  const data=JSON.parse(raw);
  if(!Array.isArray(data) || !data.every(validateNpc)) throw new Error("Invalid GM creature library");
  const ids=data.map(n=>n.id);
  if(new Set(ids).size!==ids.length) throw new Error("Duplicate creature identifiers");
  return data;
}
export function serializeLibrary(npcs){
  if(!Array.isArray(npcs)||!npcs.every(validateNpc)) throw new Error("Invalid GM creature");
  return JSON.stringify(npcs,null,2);
}
export function loadLibrary(storage){
  const raw=storage.getItem(STORAGE_KEY);
  return raw===null ? [] : parseLibrary(raw);
}
export function saveLibrary(storage,npcs){ storage.setItem(STORAGE_KEY,serializeLibrary(npcs)); }
export function skillForEngine(npc,group,skill){
  return {name:skill,supplied:effectiveSkill(npc,group,skill)};
}

/** Classification is for the creature library, not encounter membership. */
export function creatureType(npc){ return (npc.type ?? "").trim(); }
export function libraryTypes(npcs){
  return [...new Set(npcs.map(creatureType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));
}
export function groupedLibrary(npcs,filter=""){
  const types=libraryTypes(npcs);
  const groups=[...types,""];
  return groups.filter(type=>!filter || type===filter).map(type=>({
    type,
    creatures:npcs.filter(n=>creatureType(n)===type).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:"base"}))
  })).filter(g=>g.creatures.length>0);
}
