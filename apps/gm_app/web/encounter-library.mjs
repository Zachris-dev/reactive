import {initialEncounter,validateEncounter,ENCOUNTER_STORAGE_KEY} from "./encounter-model.mjs";

export const ENCOUNTER_LIBRARY_KEY="reactive-gm-encounter-library-v1";
const clone=value=>structuredClone(value);
const validId=id=>typeof id==="string"&&id.length>0;

export function newEncounterPlan(id,name="New encounter"){
 if(!validId(id)||typeof name!=="string")throw Error("Invalid encounter plan");
 return {id,name,encounter:initialEncounter()};
}
export function initialEncounterLibrary(id="encounter-1"){
 return {plans:[newEncounterPlan(id)],selectedId:id,execution:null};
}
export function selectedPlan(library){
 return library.plans.find(p=>p.id===library.selectedId)||null;
}
export function validateEncounterLibrary(library,npcs){
 if(!library||!Array.isArray(library.plans)||!library.plans.length)throw Error("No encounter plans");
 const ids=library.plans.map(p=>p.id);
 if(ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)throw Error("Duplicate or invalid encounter plan IDs");
 for(const p of library.plans){
  if(typeof p.name!=="string")throw Error("Invalid encounter plan name");
  validateEncounter(p.encounter,npcs);
 }
 if(!ids.includes(library.selectedId))throw Error("Selected encounter not found");
 const x=library.execution;
 if(x!==null){
  if(!x||!ids.includes(x.sourcePlanId))throw Error("Execution source encounter not found");
  validateEncounter(x.encounter,npcs);
 }
 return library;
}
export function addPlan(library,id,name="New encounter"){
 if(library.plans.some(p=>p.id===id))throw Error("Duplicate encounter plan");
 const plan=newEncounterPlan(id,name);
 return {...library,plans:[...library.plans,plan],selectedId:id};
}
export function copyPlan(library,id){
 const original=selectedPlan(library);
 if(!original||!validId(id)||library.plans.some(p=>p.id===id))throw Error("Invalid encounter copy");
 const copy={id,name:original.name+" (copy)",encounter:clone(original.encounter)};
 return {...library,plans:[...library.plans,copy],selectedId:id};
}
export function selectPlan(library,id){
 if(!library.plans.some(p=>p.id===id))throw Error("Unknown encounter plan");
 return {...library,selectedId:id};
}
export function renamePlan(library,id,name){
 if(typeof name!=="string"||!library.plans.some(p=>p.id===id))throw Error("Invalid encounter name");
 return {...library,plans:library.plans.map(p=>p.id===id?{...p,name}:p)};
}
export function updateEncounterInLibrary(library,fn){
 const execution=library.execution;
 if(execution){
  return {...library,execution:{...execution,encounter:fn(execution.encounter)}};
 }
 return {...library,plans:library.plans.map(p=>p.id===library.selectedId?{...p,encounter:fn(p.encounter)}:p)};
}
export function activateEncounter(library){
 if(library.execution)throw Error("An encounter is already executing");
 const plan=selectedPlan(library);
 if(!plan)throw Error("No encounter selected");
 return {...library,execution:{sourcePlanId:plan.id,encounter:clone(plan.encounter)}};
}
export function endExecution(library){
 if(!library.execution)return library;
 return {...library,selectedId:library.execution.sourcePlanId,execution:null};
}
export function deletePlan(library,id){
 if(library.plans.length===1)throw Error("At least one encounter plan must remain");
 if(library.execution?.sourcePlanId===id)throw Error("Cannot delete the plan of an executing encounter");
 const plans=library.plans.filter(p=>p.id!==id);
 if(plans.length===library.plans.length)throw Error("Encounter plan not found");
 return {...library,plans,selectedId:library.selectedId===id?plans[0].id:library.selectedId};
}
export function currentEncounter(library){
 return library.execution?.encounter||selectedPlan(library)?.encounter||null;
}
export function saveEncounterLibrary(storage,library,npcs){
 storage.setItem(ENCOUNTER_LIBRARY_KEY,JSON.stringify(validateEncounterLibrary(library,npcs)));
}
export function loadEncounterLibrary(storage,npcs){
 const raw=storage.getItem(ENCOUNTER_LIBRARY_KEY);
 if(raw!==null)return validateEncounterLibrary(JSON.parse(raw),npcs);
 // Read old single-encounter data in place. The first save uses the new key;
 // never delete the original value during migration.
 const old=storage.getItem(ENCOUNTER_STORAGE_KEY);
 if(old===null)return initialEncounterLibrary();
 const encounter=validateEncounter(JSON.parse(old),npcs);
 const library=initialEncounterLibrary();
 library.plans[0].name="Imported encounter";
 library.plans[0].encounter=clone(encounter);
 return library;
}
