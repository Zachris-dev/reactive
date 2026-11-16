export const ENCOUNTER_STORAGE_KEY="reactive-gm-encounter-v1";
const hasId=x=>typeof x==="string"&&x.length>0;
const isMember=m=>m&&hasId(m.npcId)&&Number.isSafeInteger(m.count)&&m.count>0;
const isUnit=u=>u&&hasId(u.id)&&typeof u.name==="string"&&
 (u.sourceGroupId===null||hasId(u.sourceGroupId))&&Array.isArray(u.members)&&
 u.members.every(isMember)&&new Set(u.members.map(m=>m.npcId)).size===u.members.length;
export function initialEncounter(){
 return {sides:[{id:"side-1",name:"Side 1 — PCs & allies",status:"active",units:[]}]};
}
export function addSide(encounter,id){
 if(!hasId(id)||encounter.sides.some(s=>s.id===id))throw Error("Duplicate or invalid side ID");
 return {...encounter,sides:[...encounter.sides,{id,name:"Side "+(encounter.sides.length+1),status:"active",units:[]}]};
}
export function updateSide(encounter,id,patch){
 if(!encounter.sides.some(s=>s.id===id))throw Error("Unknown side");
 const allowed={};
 if(patch.name!==undefined){if(typeof patch.name!=="string")throw Error("Invalid side name");allowed.name=patch.name;}
 if(patch.status!==undefined){if(!["active","reserve"].includes(patch.status))throw Error("Invalid side status");allowed.status=patch.status;}
 return {...encounter,sides:encounter.sides.map(s=>s.id===id?{...s,...allowed}:s)};
}
export function deleteSide(encounter,id){
 if(id==="side-1")throw Error("Side 1 is reserved for PCs and allies");
 return {...encounter,sides:encounter.sides.filter(s=>s.id!==id)};
}
export function addGroupToSide(encounter,sideId,group,unitId){
 if(!hasId(unitId)||!hasId(group?.id))throw Error("Invalid source group or unit ID");
 if(encounter.sides.some(s=>s.units.some(u=>u.id===unitId)))throw Error("Duplicate encounter unit ID");
 if(!Array.isArray(group.members)||!group.members.every(isMember))throw Error("Invalid source members");
 const unit={id:unitId,sourceGroupId:group.id,name:group.name,notes:group.notes||"",members:structuredClone(group.members)};
 return applyUnit(encounter,sideId,unit);
}
export function addCreatureToSide(encounter,sideId,creature,unitId){
 if(!hasId(unitId)||!hasId(creature?.id))throw Error("Invalid creature or unit ID");
 if(encounter.sides.some(s=>s.units.some(u=>u.id===unitId)))throw Error("Duplicate encounter unit ID");
 return applyUnit(encounter,sideId,{id:unitId,sourceGroupId:null,name:creature.name,notes:"",members:[{npcId:creature.id,count:1}]});
}
function applyUnit(encounter,sideId,unit){
 if(!encounter.sides.some(s=>s.id===sideId))throw Error("Unknown side");
 return {...encounter,sides:encounter.sides.map(s=>s.id===sideId?{...s,units:[...s.units,unit]}:s)};
}
export function removeUnit(encounter,sideId,unitId){
 return {...encounter,sides:encounter.sides.map(s=>s.id===sideId?{...s,units:s.units.filter(u=>u.id!==unitId)}:s)};
}
export function initiativeParticipants(encounter){
 return encounter.sides.filter(s=>s.status==="active").flatMap(s=>s.units.flatMap(u=>u.members.flatMap(m=>
  Array.from({length:m.count},(_,index)=>({sideId:s.id,unitId:u.id,npcId:m.npcId,ordinal:index+1}))
 )));
}
export function validateEncounter(encounter,npcs){
 if(!encounter||!Array.isArray(encounter.sides)||!encounter.sides.length)throw Error("Encounter must contain Side 1");
 if(encounter.sides[0].id!=="side-1"||new Set(encounter.sides.map(s=>s.id)).size!==encounter.sides.length)throw Error("Invalid side IDs");
 const ids=new Set(npcs.map(n=>n.id));const unitIds=new Set();
 for(const side of encounter.sides){
  if(!hasId(side.id)||typeof side.name!=="string"||!["active","reserve"].includes(side.status)||!Array.isArray(side.units))throw Error("Invalid encounter side");
  for(const unit of side.units){
   if(!isUnit(unit)||unitIds.has(unit.id))throw Error("Invalid or duplicate encounter unit");
   unitIds.add(unit.id);
   if(unit.members.some(m=>!ids.has(m.npcId)))throw Error("Encounter refers to an unavailable creature");
  }
 }
 return encounter;
}
export function saveEncounter(storage,encounter,npcs){
 storage.setItem(ENCOUNTER_STORAGE_KEY,JSON.stringify(validateEncounter(encounter,npcs)));
}
export function loadEncounter(storage,npcs){
 const raw=storage.getItem(ENCOUNTER_STORAGE_KEY);
 return raw===null?initialEncounter():validateEncounter(JSON.parse(raw),npcs);
}
