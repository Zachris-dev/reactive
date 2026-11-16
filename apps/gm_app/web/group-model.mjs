export const GROUP_STORAGE_KEY="reactive-gm-groups-v1";
const validId=x=>typeof x==="string"&&x.length>0;
export function newGroup(id,name="New group"){
 if(!validId(id))throw Error("Group ID required");
 return {id,name,notes:"",members:[]};
}
export function copyGroup(group,id){
 if(!validGroup(group)||!validId(id)||id===group.id)throw Error("Invalid group copy");
 return {...structuredClone(group),id};
}
export function validGroup(g){
 return !!g&&typeof g==="object"&&validId(g.id)&&typeof g.name==="string"&&typeof g.notes==="string"&&
 Array.isArray(g.members)&&g.members.every(m=>m&&validId(m.npcId)&&Number.isSafeInteger(m.count)&&m.count>0)&&
 new Set(g.members.map(m=>m.npcId)).size===g.members.length;
}
export function addMembers(g,npcId,count=1){
 if(!validGroup(g)||!validId(npcId)||!Number.isSafeInteger(count)||count<1)throw Error("Invalid group addition");
 const members=g.members.map(m=>({...m}));
 const existing=members.find(m=>m.npcId===npcId);
 if(existing)existing.count+=count;
 else members.push({npcId,count});
 return {...g,members};
}
export function removeMembers(g,npcId){
 if(!validGroup(g))throw Error("Invalid group");
 return {...g,members:g.members.filter(m=>m.npcId!==npcId)};
}
export function referencesTo(groups,npcId){
 return groups.filter(g=>g.members.some(m=>m.npcId===npcId));
}
export function resolvedMembers(group,npcs){
 const byId=new Map(npcs.map(n=>[n.id,n]));
 return group.members.map(m=>({...m,creature:byId.get(m.npcId)||null}));
}
export function validateGroupLibrary(groups,npcs){
 if(!Array.isArray(groups)||!groups.every(validGroup))throw Error("Invalid group library");
 if(new Set(groups.map(g=>g.id)).size!==groups.length)throw Error("Duplicate group IDs");
 const ids=new Set(npcs.map(n=>n.id));
 if(groups.some(g=>g.members.some(m=>!ids.has(m.npcId))))throw Error("Group refers to an unavailable creature");
 return groups;
}
export function parseGroups(raw,npcs){
 return validateGroupLibrary(JSON.parse(raw),npcs);
}
export function loadGroups(storage,npcs){
 const raw=storage.getItem(GROUP_STORAGE_KEY);
 return raw===null?[]:parseGroups(raw,npcs);
}
export function saveGroups(storage,groups,npcs){
 storage.setItem(GROUP_STORAGE_KEY,JSON.stringify(validateGroupLibrary(groups,npcs)));
}
/** A future encounter planner must deep-copy group composition into its own state.
 * This planner never modifies a live encounter. */
export function encounterSnapshot(group){
 if(!validGroup(group))throw Error("Invalid group");
 return structuredClone({sourceGroupId:group.id,name:group.name,notes:group.notes,members:group.members});
}
