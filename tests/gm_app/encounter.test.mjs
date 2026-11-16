import assert from "node:assert/strict";
import {test} from "node:test";
import {newNpc} from "../../apps/gm_app/web/model.mjs";
import {newGroup,addMembers} from "../../apps/gm_app/web/group-model.mjs";
import {initialEncounter,addSide,updateSide,deleteSide,addGroupToSide,addCreatureToSide,removeUnit,initiativeParticipants,validateEncounter,saveEncounter,loadEncounter,ENCOUNTER_STORAGE_KEY} from "../../apps/gm_app/web/encounter-model.mjs";
import {encounterLayout} from "../../apps/gm_app/web/encounter-ui.mjs";
const npcs=[newNpc("goblin","Goblin"),newNpc("wolf","Wolf")];
const group=addMembers(addMembers(newGroup("pack","Wolf Pack"),"wolf",3),"goblin",2);
const esc=s=>String(s);
const icon=()=>"<svg></svg>";

test("new encounter starts with PC Side 1 and an empty active Side 2",()=>{
 const e=initialEncounter();
 assert.equal(e.sides.length,2);
 assert.equal(e.sides[0].id,"side-1");assert.equal(e.sides[0].status,"active");
 assert.match(e.sides[0].name,/PCs/);
 assert.deepEqual(e.sides[0].units,[]);
 assert.deepEqual(e.sides[1],{id:"side-2",name:"Side 2",status:"active",units:[]});
});
test("sides are unlimited and can be active or reserve",()=>{
 let e=initialEncounter();
 for(let i=3;i<=30;i++)e=addSide(e,"side-"+i);
 assert.equal(e.sides.length,30);
 e=updateSide(e,"side-2",{name:"Reinforcements",status:"reserve"});
 assert.equal(e.sides[1].status,"reserve");
 assert.equal(e.sides[1].name,"Reinforcements");
 e=updateSide(e,"side-2",{status:"active"});
 assert.equal(e.sides[1].status,"active");
 assert.throws(()=>updateSide(e,"side-2",{status:"unknown"}),/status/);
 assert.throws(()=>addSide(e,"side-2"),/Duplicate/);
});
test("Side 1 cannot be deleted, other sides can",()=>{
 let e=initialEncounter();
 assert.throws(()=>deleteSide(e,"side-1"),/reserved/);
 e=deleteSide(e,"side-2");
 assert.equal(e.sides.length,1);
});
test("adding a saved group copies membership but never edits the group template",()=>{
 let e=addSide(initialEncounter(),"enemy");
 e=addGroupToSide(e,"enemy",group,"unit-a");
 assert.deepEqual(e.sides[2].units[0].members,group.members);
 assert.equal(e.sides[2].units[0].sourceGroupId,"pack");
 e.sides[2].units[0].members[0].count=1;
 assert.equal(group.members[0].count,3);
});
test("adding individual creature creates a distinct encounter unit",()=>{
 let e=initialEncounter();
 e=addCreatureToSide(e,"side-1",npcs[0],"unit1");
 e=addCreatureToSide(e,"side-1",npcs[0],"unit2");
 assert.equal(e.sides[0].units.length,2);
 assert.deepEqual(e.sides[0].units[0].members,[{npcId:"goblin",count:1}]);
 assert.throws(()=>addCreatureToSide(e,"side-1",npcs[0],"unit2"),/Duplicate/);
 e=removeUnit(e,"side-1","unit1");
 assert.equal(e.sides[0].units.length,1);
});
test("reserve sides excluded from initiative until activated",()=>{
 let e=addSide(initialEncounter(),"ambush");
 e=addCreatureToSide(e,"side-1",npcs[0],"ally");
 e=addGroupToSide(e,"ambush",group,"waiting");
 e=updateSide(e,"ambush",{status:"reserve"});
 assert.equal(initiativeParticipants(e).length,1);
 e=updateSide(e,"ambush",{status:"active"});
 assert.equal(initiativeParticipants(e).length,6);
});
test("save and reload encounter offline preserves side statuses",()=>{
 const entries=new Map();
 const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
 let e=addSide(initialEncounter(),"enemy");
 e=updateSide(e,"enemy",{status:"reserve"});
 e=addGroupToSide(e,"enemy",group,"unit-a");
 saveEncounter(storage,e,npcs);
 assert.ok(entries.has(ENCOUNTER_STORAGE_KEY));
 assert.deepEqual(loadEncounter(storage,npcs),e);
 assert.deepEqual(loadEncounter({getItem:()=>null},npcs),initialEncounter());
});
test("broken creature references rejected on restoration",()=>{
 let e=addGroupToSide(initialEncounter(),"side-1",group,"unit-a");
 assert.throws(()=>validateEncounter(e,[npcs[0]]),/unavailable/);
});
test("encounter screen has two collapsible side libraries and active/reserve controls",()=>{
 let e=addSide(initialEncounter(),"enemy");
 e=updateSide(e,"enemy",{status:"reserve"});
 const html=encounterLayout(e,[group],npcs,icon,esc);
 assert.match(html,/Saved groups/);
 assert.match(html,/Creatures/);
 assert.match(html,/data-action="toggle-groups"/);
 assert.match(html,/data-action="toggle-creatures"/);
 assert.match(html,/data-action="encounter-new-side"/);
 assert.match(html,/data-side-status="enemy"/);
 assert.match(html,/value="reserve" selected/);
 assert.match(html,/PC party — character sheet integration pending/);
 const collapsed=encounterLayout(e,[group],npcs,icon,esc,{groupsCollapsed:true,creaturesCollapsed:true});
 assert.match(collapsed,/class="encounter-library collapsed"/);
 assert.doesNotMatch(collapsed,/class="encounter-source"/);
});
