import assert from "node:assert/strict";
import {test} from "node:test";
import {VALUES,STORAGE_KEY,newNpc,effectiveSkill,assign,remove,parseLibrary,serializeLibrary,loadLibrary,saveLibrary,skillKey,skillForEngine,validateNpc} from "../../apps/gm_app/web/model.mjs";
import {GROUPS,MAGIC_ALTERNATIVES} from "../../apps/gm_app/web/skills.mjs";
const make=()=>newNpc("id-1","Scout");
test("palette contains 5..95 in increments of five",()=>assert.deepEqual(VALUES,Array.from({length:19},(_,i)=>(i+1)*5)));
test("unassigned skills resolve to zero and no zero entries are stored",()=>{
 const c=make();assert.equal(effectiveSkill(c,"Social","Smalltalk"),0);assert.deepEqual(c.groups,{});assert.deepEqual(c.skills,{});
});
test("group assignment is inherited by all skills",()=>{
 const c=assign(make(),"group","Social",40);
 assert.equal(effectiveSkill(c,"Social","Smalltalk"),40);
 assert.equal(effectiveSkill(c,"Social","Oration"),40);
 assert.equal(effectiveSkill(c,"Combat","Sword"),0);
});
test("individual skills override group values in both directions",()=>{
 let c=assign(make(),"group","Social",40);
 c=assign(c,"skill",skillKey("Social","Forceful"),15);
 c=assign(c,"skill",skillKey("Social","Logical"),65);
 assert.equal(effectiveSkill(c,"Social","Forceful"),15);
 assert.equal(effectiveSkill(c,"Social","Logical"),65);
 assert.equal(effectiveSkill(c,"Social","Smalltalk"),40);
});
test("groups can be overwritten without affecting individual overrides",()=>{
 let c=assign(make(),"group","Social",20);
 c=assign(c,"skill",skillKey("Social","Forceful"),10);
 c=assign(c,"group","Social",75);
 assert.equal(effectiveSkill(c,"Social","Forceful"),10);
 assert.equal(effectiveSkill(c,"Social","Smalltalk"),75);
});
test("removing a skill restores inheritance; removing group restores zero",()=>{
 let c=assign(make(),"group","Social",30);
 c=assign(c,"skill",skillKey("Social","Forceful"),10);
 c=remove(c,"skill",skillKey("Social","Forceful"));
 assert.equal(effectiveSkill(c,"Social","Forceful"),30);
 c=remove(c,"group","Social");
 assert.equal(effectiveSkill(c,"Social","Forceful"),0);
 assert.deepEqual(c.skills,{});assert.deepEqual(c.groups,{});
});
test("removing a group does not remove explicit skills",()=>{
 let c=assign(make(),"group","Social",20);
 c=assign(c,"skill",skillKey("Social","Forceful"),10);
 c=remove(c,"group","Social");
 assert.equal(effectiveSkill(c,"Social","Forceful"),10);
 assert.equal(effectiveSkill(c,"Social","Smalltalk"),0);
});
test("values are reusable and unsupported values are rejected",()=>{
 let c=assign(make(),"group","Social",20);
 c=assign(c,"group","Combat",20);
 c=assign(c,"skill",skillKey("Combat","Sword"),20);
 assert.equal(c.groups.Social,c.groups.Combat);
 assert.throws(()=>assign(c,"group","Mind",0));
 assert.throws(()=>assign(c,"skill","Mind::Focus",100));
 assert.throws(()=>assign(c,"skill","Mind::Focus",22));
});
test("sparse save/load roundtrip retains GM origin and fields",()=>{
 let c=assign(make(),"group","Social",30);
 c=assign(c,"skill",skillKey("Social","Forceful"),5);
 c={...c,description:"A short scout",icon:"wolf",color:"#abcdef"};
 const raw=serializeLibrary([c]); const parsed=parseLibrary(raw);
 assert.deepEqual(parsed,[c]);assert.equal(raw.includes('"Smalltalk"'),false);
 assert.equal(parsed[0].creationMode,"gm");
 assert.deepEqual(skillForEngine(parsed[0],"Social","Forceful"),{name:"Forceful",supplied:5});
});
test("invalid save data and player characters cannot be loaded as GM creatures",()=>{
 assert.equal(validateNpc({...make(),creationMode:"player"}),false);
 assert.throws(()=>parseLibrary('[{"creationMode":"player"}]'));
 assert.throws(()=>parseLibrary('{"bad":true}'));
 assert.throws(()=>parseLibrary(serializeLibrary([make(),make()])));
});
test("storage adapter persists locally and restores values",()=>{
 const entries=new Map();
 const storage={getItem:k=>entries.has(k)?entries.get(k):null,setItem:(k,v)=>entries.set(k,v)};
 assert.deepEqual(loadLibrary(storage),[]);
 saveLibrary(storage,[make()]);
 assert.ok(entries.has(STORAGE_KEY));
 assert.deepEqual(loadLibrary(storage),[make()]);
});
test("character sheet has twelve named skill groups and four magic disciplines",()=>{
 assert.equal(GROUPS.length,12);
 assert.equal(new Set(GROUPS.map(g=>g.name)).size,12);
 for(const group of GROUPS)assert.equal(group.skills.length,10,group.name);
 assert.deepEqual(Object.keys(MAGIC_ALTERNATIVES),["Arcane","Divine","Druidic","Physical Adept"]);
 for(const skills of Object.values(MAGIC_ALTERNATIVES))assert.equal(skills.length,10);
});

test("player character parser includes an explicit GM origin guard",async()=>{
 const {readFile}=await import("node:fs/promises");
 const source=await readFile(new URL("../../apps/character_sheet/web/character-save.js",import.meta.url),"utf8");
 assert.ok(source.includes('data.creationMode==="gm"'));
});
