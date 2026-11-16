import assert from "node:assert/strict";
import {test} from "node:test";
import {newNpc,assign,skillKey,effectiveSkill} from "../../apps/gm_app/web/model.mjs";
import {GROUP_STORAGE_KEY,newGroup,copyGroup,addMembers,removeMembers,referencesTo,resolvedMembers,parseGroups,loadGroups,saveGroups,encounterSnapshot} from "../../apps/gm_app/web/group-model.mjs";

const creatures=()=>[newNpc("goblin","Goblin"),newNpc("wolf","Wolf")];
test("new group has independent name, notes, and empty member references",()=>{
 assert.deepEqual(newGroup("group-1"),{id:"group-1",name:"New group",notes:"",members:[]});
});
test("adding creatures stores IDs and counts, not creature statistics",()=>{
 let g=newGroup("one","Raiders");
 g=addMembers(g,"goblin",1);
 g=addMembers(g,"goblin",9);
 g=addMembers(g,"wolf",3);
 assert.deepEqual(g.members,[{npcId:"goblin",count:10},{npcId:"wolf",count:3}]);
 assert.equal(JSON.stringify(g).includes("creationMode"),false);
 assert.equal(JSON.stringify(g).includes("skills"),false);
});
test("quantity controls 1,3,5,9,19 add correct totals",()=>{
 let g=newGroup("one");
 for(const n of [1,3,5,9,19])g=addMembers(g,"goblin",n);
 assert.equal(g.members[0].count,37);
 assert.throws(()=>addMembers(g,"wolf",0),/Invalid/);
 assert.throws(()=>addMembers(g,"wolf",-1),/Invalid/);
});
test("removing one creature type leaves other references",()=>{
 let g=addMembers(addMembers(newGroup("one"),"goblin",5),"wolf",2);
 g=removeMembers(g,"goblin");
 assert.deepEqual(g.members,[{npcId:"wolf",count:2}]);
});
test("group copy is independent, has new ID and preserves notes",()=>{
 const g=addMembers({...newGroup("one","Ambush"),notes:"Watch for archers"},"goblin",9);
 const c=copyGroup(g,"two");
 assert.deepEqual({...c,id:"one"},g);
 c.members[0].count=1;
 c.notes="Different";
 assert.equal(g.members[0].count,9);
 assert.equal(g.notes,"Watch for archers");
 assert.throws(()=>copyGroup(g,"one"),/Invalid/);
});
test("all members resolve current creature data by ID",()=>{
 const g=addMembers(newGroup("one"),"goblin",3);
 let npcs=creatures();
 let entries=resolvedMembers(g,npcs);
 assert.equal(entries[0].creature.name,"Goblin");
 npcs=npcs.map(n=>n.id==="goblin"?assign({...n,name:"Goblin Veteran"},"skill",skillKey("Combat","Sword"),75):n);
 entries=resolvedMembers(g,npcs);
 assert.equal(entries[0].creature.name,"Goblin Veteran");
 assert.equal(effectiveSkill(entries[0].creature,"Combat","Sword"),75);
 assert.deepEqual(g.members,[{npcId:"goblin",count:3}]);
});
test("references identify creatures in multiple groups",()=>{
 const a=addMembers(newGroup("a"),"goblin",3);
 const b=addMembers(newGroup("b"),"wolf",1);
 const c=addMembers(newGroup("c"),"goblin",19);
 assert.deepEqual(referencesTo([a,b,c],"goblin").map(g=>g.id),["a","c"]);
});
test("broken references and duplicate groups are rejected",()=>{
 const g=addMembers(newGroup("one"),"goblin",1);
 assert.throws(()=>parseGroups(JSON.stringify([g]),[]),/unavailable/);
 assert.throws(()=>parseGroups(JSON.stringify([g,g]),creatures()),/Duplicate/);
 assert.throws(()=>parseGroups(JSON.stringify([{...g,members:[{npcId:"goblin",count:0}]}]),creatures()),/Invalid/);
});
test("offline save and load preserve group composition and notes",()=>{
 const db=new Map();
 const storage={getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,v)};
 const g=addMembers({...newGroup("one","Wolf Pack"),notes:"Tracks at dawn"},"wolf",5);
 assert.deepEqual(loadGroups(storage,creatures()),[]);
 saveGroups(storage,[g],creatures());
 assert.ok(db.has(GROUP_STORAGE_KEY));
 assert.deepEqual(loadGroups(storage,creatures()),[g]);
});
test("future encounter snapshot is isolated from saved group",()=>{
 const g=addMembers(newGroup("one"),"goblin",9);
 const snap=encounterSnapshot(g);
 snap.members[0].count=2;
 assert.equal(g.members[0].count,9);
 assert.equal(snap.sourceGroupId,"one");
});
