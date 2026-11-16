import assert from "node:assert/strict";
import {test} from "node:test";
import {VALUES,STORAGE_KEY,newNpc,effectiveSkill,assign,remove,parseLibrary,serializeLibrary,loadLibrary,saveLibrary,skillKey,skillForEngine,validateNpc,creatureType,libraryTypes,groupedLibrary,copyNpc} from "../../apps/gm_app/web/model.mjs";
import {GROUPS,MAGIC_ALTERNATIVES} from "../../apps/gm_app/web/skills.mjs";
const make=()=>newNpc("id-1","Scout");
test("palette contains explicit zero and 5..95 in increments of five",()=>assert.deepEqual(VALUES,[0,...Array.from({length:19},(_,i)=>(i+1)*5)]));
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
test("explicit zero overrides a higher group value, survives save/load, and differs from removing",()=>{
 let c=assign(make(),"group","Social",65);
 c=assign(c,"skill",skillKey("Social","Smalltalk"),0);
 assert.equal(effectiveSkill(c,"Social","Smalltalk"),0);
 assert.equal(effectiveSkill(c,"Social","Oration"),65);
 const persisted=parseLibrary(serializeLibrary([c]))[0];
 assert.equal(persisted.skills[skillKey("Social","Smalltalk")],0);
 assert.equal(skillForEngine(persisted,"Social","Smalltalk").supplied,0);
 c=remove(persisted,"skill",skillKey("Social","Smalltalk"));
 assert.equal(effectiveSkill(c,"Social","Smalltalk"),65);
});

test("types are optional and group creatures next to each other in sorted order",()=>{
 const all=[
  {...newNpc("a","Wolf"),type:"Highland Beasts"},
  {...newNpc("b","Spear Goblin"),type:"Goblins"},
  {...newNpc("c","Archer Goblin"),type:"Goblins"},
  {...newNpc("d","Wanderer"),type:"High Emeri Humans"},
  newNpc("e","Unsorted")
 ];
 assert.deepEqual(libraryTypes(all),["Goblins","High Emeri Humans","Highland Beasts"]);
 const grouped=groupedLibrary(all);
 assert.deepEqual(grouped.map(g=>g.type),["Goblins","High Emeri Humans","Highland Beasts",""]);
 assert.deepEqual(grouped[0].creatures.map(n=>n.name),["Archer Goblin","Spear Goblin"]);
 assert.deepEqual(groupedLibrary(all,"Goblins").flatMap(g=>g.creatures.map(n=>n.id)),["c","b"]);
 assert.equal(creatureType({name:"Old NPC"}),"");
 assert.equal(parseLibrary(serializeLibrary([newNpc("legacy")]))[0].type,"");
});

test("legacy creature saves without type remain valid and are unclassified",()=>{
 const c=make();delete c.type;
 assert.equal(validateNpc(c),true);
 assert.equal(groupedLibrary(parseLibrary(serializeLibrary([c])))[0].type,"");
});
test("type and explicit zero overrides survive serialization together",()=>{
 let c={...make(),type:"Goblins"};
 c=assign(c,"group","Social",35);
 c=assign(c,"skill",skillKey("Social","Smalltalk"),0);
 const recovered=parseLibrary(serializeLibrary([c]))[0];
 assert.equal(recovered.type,"Goblins");
 assert.equal(effectiveSkill(recovered,"Social","Smalltalk"),0);
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

test("New Copy duplicates all creature details and skill assignments with a new ID",()=>{
 let original={...make(),type:"Goblins",name:"Goblin Warrior",description:"Shield fighter",icon:"monster-square",color:"#44aa77",magicChoice:"Divine"};
 original=assign(original,"group","Social",55);
 original=assign(original,"skill",skillKey("Social","Smalltalk"),0);
 original=assign(original,"skill",skillKey("Combat","Sword"),80);
 const duplicate=copyNpc(original,"id-2");
 assert.equal(duplicate.id,"id-2");
 assert.deepEqual({...duplicate,id:original.id},original);
 assert.equal(effectiveSkill(duplicate,"Social","Smalltalk"),0);
 assert.deepEqual(parseLibrary(serializeLibrary([original,duplicate])),[original,duplicate]);
});

test("New Copy does not share mutable objects with its source",()=>{
 let original=assign(make(),"group","Social",40);
 original=assign(original,"skill",skillKey("Social","Smalltalk"),10);
 const duplicate=copyNpc(original,"id-2");
 duplicate.groups.Social=75;
 duplicate.skills[skillKey("Social","Smalltalk")]=0;
 duplicate.name="Different";
 assert.equal(original.groups.Social,40);
 assert.equal(original.skills[skillKey("Social","Smalltalk")],10);
 assert.equal(original.name,"Scout");
 assert.equal(duplicate.id,"id-2");
});

test("New Copy rejects reused IDs and invalid player-origin creatures",()=>{
 assert.throws(()=>copyNpc(make(),"id-1"),/new ID/);
 assert.throws(()=>copyNpc({...make(),creationMode:"player"},"id-2"),/invalid/);
});

test("creature list has viewport-bounded flex scrolling",async()=>{
 const {readFile}=await import("node:fs/promises");
 const css=await readFile(new URL("../../apps/gm_app/web/style.css",import.meta.url),"utf8");
 assert.match(css,/\.sidebar\{[^}]*max-height:calc\(100dvh - 20px\)/);
 assert.match(css,/\.sidebar\{[^}]*display:flex;flex-direction:column;min-height:0;overflow:hidden/);
 assert.match(css,/\.creature-list\{[^}]*flex:1 1 auto;min-height:0;overflow-y:auto/);
 assert.match(css,/@media\(max-width:750px\)\{\.creature-list\{flex:none;/);
});
