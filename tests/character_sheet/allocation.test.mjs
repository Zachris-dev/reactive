import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCampaign} from "../../apps/character_sheet/web/template-parser.js";
import {allocationsFromCampaign,makeAllocationState,keyFor,remaining,assign,remove,testPalette,humanBodyClassification,skillBase,removeAssignment,allocationRequirements} from "../../apps/character_sheet/web/allocation.js";
const text=readFileSync(new URL("../../campaigns/the-eldrich-race/campaign.txt",import.meta.url),"utf8");
const parsed=parseCampaign(text);
test("common culture gives category values 1..5 and skill values 1..40",()=>{
 const c=allocationsFromCampaign(parsed,"High Emeri");
 assert.deepEqual(c.category,[1,2,3,4,5]);
 assert.deepEqual(c.skill,Array.from({length:40},(_,i)=>i+1));
 assert.ok(c.initial.some(r=>r.skill==="High Emeri"&&r.value===30));
 assert.ok(c.initial.some(r=>r.skill==="Emerspeak"&&r.value===30));
});
test("Vaelthar has two copies of each 1..30 skill value",()=>{
 const c=allocationsFromCampaign(parsed,"Vaelthar");
 assert.equal(c.skill.length,60);
 assert.equal(c.skill.filter(n=>n===30).length,2);
 assert.equal(c.required.filter(r=>!r.fixed).length,2);
});
test("tap or drop allocations use a token exactly once",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 assert.equal(assign(state,"category","Combat",5),true);
 assert.equal(assign(state,"category","Battle",5),false);
 assert.equal(remaining(state,"category").includes(5),false);
 assert.equal(assign(state,"skill",keyFor("Combat","Sword"),20),true);
 assert.equal(assign(state,"skill",keyFor("Combat","Shield"),20),false);
});
test("replacing an allocation refunds the original token",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 assert.equal(assign(state,"category","Combat",1),true);
 assert.equal(assign(state,"category","Combat",2),true);
 assert.equal(remaining(state,"category").includes(1),true);
 assert.equal(remaining(state,"category").includes(2),false);
 assert.equal(remove(state,"category","Combat"),true);
 assert.equal(remaining(state,"category").includes(2),true);
});
test("initial culture and language assignments can be changed or removed and cause invalidity",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 assert.equal(skillBase(state,keyFor("Culture","High Emeri")),30);
 assert.equal(assign(state,"skill",keyFor("Culture","High Emeri"),1),true);
 assert.equal(skillBase(state,keyFor("Culture","High Emeri")),1);
 assert.ok(allocationRequirements(state,"High Emeri","Emerspeak").some(x=>x.includes("Culture")));
 assert.equal(removeAssignment(state,"skill",keyFor("Language","Emerspeak")),true);
 assert.ok(allocationRequirements(state,"High Emeri","Emerspeak").some(x=>x.includes("Language")));
});
test("nonexistent tokens and mismatched pools cannot be assigned",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 assert.equal(assign(state,"category","Combat",40),false);
 assert.equal(assign(state,"skill",keyFor("Combat","Sword"),41),false);
 assert.equal(assign(state,"skill",keyFor("Combat","Sword"),2.5),false);
});
test("palette is independent of the rules and can be replaced",()=>{
 assert.match(testPalette.category,/^#[\da-f]{6}$/i);
 assert.match(testPalette.skill,/^#[\da-f]{6}$/i);
});

test("human Body primary and secondary rankings follow maximum base values",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 const body={subgroups:[
  {name:"Strength",skills:[{name:"Brawn"},{name:"Clout"}]},
  {name:"Finesse",skills:[{name:"Dexterity"},{name:"Agility"}]},
  {name:"Constitution",skills:[{name:"Durability"},{name:"Health"}]}
 ]};
 const rank=()=>humanBodyClassification(state,body);
 assert.equal(assign(state,"skill",keyFor("Body","Brawn"),22),true);
 assert.equal(rank().classification.Strength,"primary");
 assert.equal(assign(state,"skill",keyFor("Body","Dexterity"),17),true);
 assert.equal(rank().classification.Finesse,"secondary");
 assert.equal(assign(state,"skill",keyFor("Body","Durability"),29),true);
 assert.equal(rank().classification.Constitution,"primary");
 assert.equal(rank().classification.Strength,"secondary");
 assert.equal(rank().violations.some(v=>v.subgroup==="Strength"),true);
 assert.equal(remove(state,"skill",keyFor("Body","Durability")),true);
 assert.equal(rank().classification.Strength,"primary");
});

test("overwriting starting language returns original token and removal returns replacement",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 const target=keyFor("Language","Emerspeak");
 const originalCount=remaining(state,"skill").filter(n=>n===30).length;
 assert.equal(assign(state,"skill",target,39),true);
 assert.equal(skillBase(state,target),39);
 assert.equal(remaining(state,"skill").filter(n=>n===30).length,originalCount+1);
 assert.equal(removeAssignment(state,"skill",target),true);
 assert.equal(skillBase(state,target),undefined);
 assert.equal(remaining(state,"skill").includes(39),true);
 assert.equal(remaining(state,"skill").filter(n=>n===30).length,originalCount+1);
 assert.equal(assign(state,"skill",keyFor("Combat","Sword"),30),true);
});
test("Seafolk Kardsworn and Vaelthar receive culture and language starting values",()=>{
 for(const [culture,language,value] of [["Seafolk","Squall (seafolk)",30],["Kardsworn","Kardish dwarf",30],["Vaelthar","Vaelan Elvish",35]]){
  const state=makeAllocationState(allocationsFromCampaign(parsed,culture));
  assert.equal(skillBase(state,keyFor("Culture",culture)),value===35?35:30);
  assert.equal(skillBase(state,keyFor("Language",language)),value);
  assert.equal(removeAssignment(state,"skill",keyFor("Language",language)),true);
  assert.ok(remaining(state,"skill").includes(value));
 }
});
