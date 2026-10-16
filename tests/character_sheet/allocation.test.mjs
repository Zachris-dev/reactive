import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCampaign} from "../../apps/character_sheet/web/template-parser.js";
import {allocationsFromCampaign,makeAllocationState,keyFor,remaining,assign,remove,testPalette} from "../../apps/character_sheet/web/allocation.js";
const text=readFileSync(new URL("../../campaigns/the-eldrich-race/campaign.txt",import.meta.url),"utf8");
const parsed=parseCampaign(text);
test("common culture gives category values 1..5 and skill values 1..40",()=>{
 const c=allocationsFromCampaign(parsed,"High Emeri");
 assert.deepEqual(c.category,[1,2,3,4,5]);
 assert.deepEqual(c.skill,Array.from({length:40},(_,i)=>i+1));
 assert.ok(c.required.some(r=>r.skill==="High Emeri"&&r.value===30&&r.fixed));
 assert.ok(c.required.some(r=>r.skill==="Emerspeak"&&r.value===30&&r.fixed));
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
test("cannot overwrite until previous value is removed",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 assert.equal(assign(state,"category","Combat",1),true);
 assert.equal(assign(state,"category","Combat",2),false);
 assert.equal(remove(state,"category","Combat"),true);
 assert.equal(remaining(state,"category").includes(1),true);
 assert.equal(assign(state,"category","Combat",2),true);
});
test("required culture and language allocations are protected",()=>{
 const state=makeAllocationState(allocationsFromCampaign(parsed,"High Emeri"));
 assert.equal(state.fixed[keyFor("Culture","High Emeri")],30);
 assert.equal(assign(state,"skill",keyFor("Culture","High Emeri"),1),false);
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
