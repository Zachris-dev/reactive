import assert from "node:assert/strict";
import {test} from "node:test";
import {newNpc} from "../../apps/gm_app/web/model.mjs";
import {initialEncounter,addSide,addCreatureToSide,initiativeParticipants,ENCOUNTER_STORAGE_KEY} from "../../apps/gm_app/web/encounter-model.mjs";
import {initialEncounterLibrary,loadEncounterLibrary,saveEncounterLibrary,addPlan,copyPlan,selectPlan,renamePlan,deletePlan,selectedPlan,activateEncounter,endExecution,currentEncounter,updateEncounterInLibrary,ENCOUNTER_LIBRARY_KEY} from "../../apps/gm_app/web/encounter-library.mjs";
import {encounterPlanBar} from "../../apps/gm_app/web/encounter-ui.mjs";
const npcs=[newNpc("goblin","Goblin")];
function storage(){
 const m=new Map();
 return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),contents:m};
}
test("encounter plans are named, separate and individually recalled",()=>{
 let lib=initialEncounterLibrary();
 lib=renamePlan(lib,lib.selectedId,"Roadside ambush");
 lib=updateEncounterInLibrary(lib,e=>addCreatureToSide(e,"side-1",npcs[0],"unit-a"));
 const oldId=lib.selectedId;
 lib=addPlan(lib,"second","Ruined temple");
 assert.equal(selectedPlan(lib).name,"Ruined temple");
 assert.equal(currentEncounter(lib).sides[0].units.length,0);
 lib=updateEncounterInLibrary(lib,e=>addSide(e,"side-two"));
 lib=selectPlan(lib,oldId);
 assert.equal(selectedPlan(lib).name,"Roadside ambush");
 assert.equal(currentEncounter(lib).sides[0].units.length,1);
 assert.equal(currentEncounter(lib).sides.length,2);
});
test("copy creates independent encounter plan with new ID and same initial composition",()=>{
 let lib=initialEncounterLibrary();
 lib=updateEncounterInLibrary(lib,e=>addCreatureToSide(e,"side-1",npcs[0],"unit-a"));
 const old=selectedPlan(lib);
 lib=copyPlan(lib,"new-copy");
 assert.equal(selectedPlan(lib).name,old.name+" (copy)");
 assert.deepEqual(selectedPlan(lib).encounter,old.encounter);
 lib=updateEncounterInLibrary(lib,e=>addSide(e,"second-side"));
 assert.equal(old.encounter.sides.length,2);
 assert.equal(selectedPlan(lib).encounter.sides.length,3);
});
test("activation makes a separate execution copy and preserves planned sides",()=>{
 let lib=initialEncounterLibrary();
 lib=updateEncounterInLibrary(lib,e=>addCreatureToSide(e,"side-1",npcs[0],"unit-a"));
 lib=activateEncounter(lib);
 assert.ok(lib.execution);
 assert.notStrictEqual(lib.execution.encounter,selectedPlan(lib).encounter);
 lib=updateEncounterInLibrary(lib,e=>addSide(e,"reinforcements"));
 assert.equal(currentEncounter(lib).sides.length,3);
 assert.equal(selectedPlan(lib).encounter.sides.length,2);
 assert.throws(()=>activateEncounter(lib),/already executing/);
 lib=endExecution(lib);
 assert.equal(lib.execution,null);
 assert.equal(currentEncounter(lib).sides.length,2);
});
test("execution and reserve status survive storage reload",()=>{
 const store=storage();
 let lib=initialEncounterLibrary();
 lib=updateEncounterInLibrary(lib,e=>addSide(e,"reserve"));
 lib=activateEncounter(lib);
 lib=updateEncounterInLibrary(lib,e=>({...e,sides:e.sides.map(s=>s.id==="reserve"?{...s,status:"reserve"}:s)}));
 saveEncounterLibrary(store,lib,npcs);
 const loaded=loadEncounterLibrary(store,npcs);
 assert.deepEqual(loaded,lib);
 assert.equal(loaded.execution.encounter.sides[2].status,"reserve");
 assert.equal(loaded.plans[0].encounter.sides[2].status,"active");
});
test("saving a plan never overwrites any other plan and survives reload",()=>{
 const store=storage();
 let lib=initialEncounterLibrary();
 lib=addPlan(lib,"second","Second encounter");
 lib=updateEncounterInLibrary(lib,e=>addCreatureToSide(e,"side-1",npcs[0],"unit-b"));
 saveEncounterLibrary(store,lib,npcs);
 const loaded=loadEncounterLibrary(store,npcs);
 assert.equal(loaded.plans[0].encounter.sides[0].units.length,0);
 assert.equal(loaded.plans[1].encounter.sides[0].units.length,1);
 assert.equal(loaded.selectedId,"second");
});
test("legacy single encounter migrates without deleting old storage",()=>{
 const store=storage();
 const old=addCreatureToSide(initialEncounter(),"side-1",npcs[0],"old-unit");
 store.setItem(ENCOUNTER_STORAGE_KEY,JSON.stringify(old));
 let lib=loadEncounterLibrary(store,npcs);
 assert.equal(lib.plans.length,1);
 assert.equal(lib.plans[0].name,"Imported encounter");
 assert.deepEqual(lib.plans[0].encounter,old);
 saveEncounterLibrary(store,lib,npcs);
 assert.ok(store.getItem(ENCOUNTER_STORAGE_KEY));
 assert.ok(store.getItem(ENCOUNTER_LIBRARY_KEY));
 assert.deepEqual(loadEncounterLibrary(store,npcs),lib);
});
test("invalid references, duplicate plan IDs and deletion of executing source are rejected",()=>{
 let lib=initialEncounterLibrary();
 lib=updateEncounterInLibrary(lib,e=>addCreatureToSide(e,"side-1",npcs[0],"unit-a"));
 const store=storage();
 assert.throws(()=>saveEncounterLibrary(store,lib,[]),/unavailable/);
 assert.throws(()=>addPlan(lib,lib.selectedId),/Duplicate/);
 assert.throws(()=>deletePlan(lib,lib.selectedId),/At least one/);
 lib=addPlan(lib,"second");
 lib=activateEncounter(lib);
 assert.throws(()=>deletePlan(lib,"second"),/executing/);
 lib=endExecution(lib);
 lib=deletePlan(lib,"second");
 assert.equal(lib.plans.length,1);
});
test("saved encounter selector and execution controls appear in UI",()=>{
 const esc=v=>String(v);
 let lib=addPlan(initialEncounterLibrary(),"second","Goblin Attack");
 let html=encounterPlanBar(lib,esc);
 assert.match(html,/Saved encounters/);
 assert.match(html,/Goblin Attack/);
 assert.match(html,/data-action="encounter-plan-new"/);
 assert.match(html,/data-action="encounter-plan-copy"/);
 assert.match(html,/data-action="encounter-plan-delete"/);
 assert.match(html,/data-action="encounter-plan-activate"/);
 lib=activateEncounter(lib);
 html=encounterPlanBar(lib,esc);
 assert.match(html,/Execution — plan preserved/);
 assert.match(html,/data-action="encounter-execution-end"/);
 assert.doesNotMatch(html,/data-action="encounter-plan-activate"/);
});

test("new saved encounter plans have both a PC side and empty Side 2",()=>{
 let library=initialEncounterLibrary();
 assert.equal(selectedPlan(library).encounter.sides.length,2);
 library=addPlan(library,"another","Second plan");
 assert.deepEqual(selectedPlan(library).encounter.sides[1],{id:"side-2",name:"Side 2",status:"active",units:[]});
});
test("legacy encounter containing only Side 1 remains readable",()=>{
 const store=storage();
 const old={sides:[{id:"side-1",name:"Side 1 — PCs & allies",status:"active",units:[]}]};
 store.setItem(ENCOUNTER_STORAGE_KEY,JSON.stringify(old));
 const library=loadEncounterLibrary(store,npcs);
 assert.deepEqual(library.plans[0].encounter,old);
});
