import assert from "node:assert/strict";
import {test} from "node:test";
import {newNpc,assign,skillKey,effectiveSkill} from "../../apps/gm_app/web/model.mjs";
import {GROUP_STORAGE_KEY,newGroup,copyGroup,addMembers,subtractMembers,removeMembers,referencesTo,resolvedMembers,parseGroups,loadGroups,saveGroups,encounterSnapshot} from "../../apps/gm_app/web/group-model.mjs";

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

test("decrement by one or ten stops at zero and removes exhausted membership",()=>{
 let g=addMembers(newGroup("one"),"goblin",19);
 g=addMembers(g,"wolf",3);
 g=subtractMembers(g,"goblin",1);
 assert.equal(g.members.find(m=>m.npcId==="goblin").count,18);
 g=subtractMembers(g,"goblin",10);
 assert.equal(g.members.find(m=>m.npcId==="goblin").count,8);
 g=subtractMembers(g,"goblin",10);
 assert.deepEqual(g.members,[{npcId:"wolf",count:3}]);
 assert.deepEqual(subtractMembers(g,"goblin",10),g);
 assert.throws(()=>subtractMembers(g,"wolf",0),/Invalid/);
 assert.throws(()=>subtractMembers(g,"wolf",-10),/Invalid/);
 assert.deepEqual(parseGroups(JSON.stringify([g]),creatures()),[g]);
});
test("compact group UI shows marker and quantity without visible member names",async()=>{
 const {groupEditor}=await import("../../apps/gm_app/web/group-ui.mjs");
 const g=addMembers(newGroup("one"),"goblin",9);
 const html=groupEditor(g,creatures(),()=>"<svg></svg>",x=>String(x),"goblin");
 assert.match(html,/class="member-grid"/);
 assert.match(html,/class="member-tile active"/);
 assert.match(html,/title="Goblin"/);
 assert.match(html,/aria-label="Goblin: 9"/);
 assert.match(html,/<strong>×9<\/strong>/);
 assert.doesNotMatch(html,/<span>Goblin<\/span>/);
 assert.match(html,/data-action="member-subtract" data-count="1"/);
 assert.match(html,/data-action="member-subtract" data-count="10"/);
});

test("saved groups sidebar previews icons and counts, not names of creature members",async()=>{
 const {groupSidebar}=await import("../../apps/gm_app/web/group-ui.mjs");
 const goblin=newNpc("goblin","Goblin Archer");
 const wolf={...newNpc("wolf","Mountain Wolf"),color:"#aabbcc",icon:"wolf"};
 const g=addMembers(addMembers(newGroup("one","Forest Patrol"),"goblin",9),"wolf",3);
 const html=groupSidebar([g],"one",x=>String(x),[goblin,wolf],(name,color)=>'<svg data-icon="'+name+'" data-color="'+color+'"></svg>');
 assert.match(html,/Forest Patrol \(12\)/);
 assert.match(html,/class="group-preview"/);
 assert.match(html,/data-icon="monster-round"/);
 assert.match(html,/data-icon="wolf"/);
 assert.match(html,/data-color="#aabbcc"/);
 assert.match(html,/group-preview-count">×9/);
 assert.match(html,/group-preview-count">×3/);
 assert.match(html,/title="Goblin Archer ×9"/);
 assert.doesNotMatch(html,/<span class="group-option-title">Goblin Archer/);
 const updated={...goblin,name:"Goblin Veteran",icon:"monster-square"};
 const newer=groupSidebar([g],"one",x=>String(x),[updated,wolf],(name)=>'<svg data-icon="'+name+'"></svg>');
 assert.match(newer,/Goblin Veteran ×9/);
 assert.match(newer,/data-icon="monster-square"/);
});
test("empty saved group shows its name without an unnecessary preview row",async()=>{
 const {groupSidebar}=await import("../../apps/gm_app/web/group-ui.mjs");
 const html=groupSidebar([newGroup("one","Empty")],"one",x=>String(x),[],()=>"<svg></svg>");
 assert.match(html,/Empty \(0\)/);
 assert.doesNotMatch(html,/class="group-preview"/);
});

test("selected icon-bearing buttons preserve their normal background",async()=>{
 const {readFile}=await import("node:fs/promises");
 const css=await readFile(new URL("../../apps/gm_app/web/style.css",import.meta.url),"utf8");
 for(const selector of [".creature:is(.selected,:hover)",".icon-pick:is(.active,:hover)",".member-tile:is(.active,:hover)",".group-option:is(.active,:hover)"]){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/\.group-option:is\(\.active,:hover\)\{background:#29374a\}/);
 assert.match(css,/\.member-tile\.active,[\s\S]*?\.group-option\.active\{border-color:#bbe1ff;outline:2px solid #bbe1ff/);
});
