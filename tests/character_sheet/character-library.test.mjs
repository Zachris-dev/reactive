import test from "node:test";
import assert from "node:assert/strict";
import {newCharacterId,preparedCharacter,openCharacterLibrary} from "../../apps/character_sheet/web/character-library.js";

test("library identities stay stable across saves and revisions advance",()=>{
 const initial={format:"Character sheet - Reactive 0.88 - Example - Created 2026-10-18",primary:{name:"Traveler"},skills:[]};
 const first=preparedCharacter(initial,{id:"character-a",now:"2026-10-18T10:00:00Z"});
 const next=preparedCharacter(first,{id:"character-a",now:"2026-10-18T11:00:00Z"});
 assert.equal(first.library.id,"character-a");
 assert.equal(first.library.revision,1);
 assert.equal(next.library.id,"character-a");
 assert.equal(next.library.revision,2);
 assert.equal(next.library.modified,"2026-10-18T11:00:00Z");
 assert.equal(initial.library,undefined);
});
test("Save Copy creates an independent identity and starts at revision one",()=>{
 const first=preparedCharacter({primary:{name:"Traveler"}},{id:"original"});
 const copy=preparedCharacter(first,{id:"duplicate"});
 assert.equal(copy.library.id,"duplicate");
 assert.equal(copy.library.revision,1);
 assert.equal(first.library.id,"original");
});
test("the local library fails clearly when IndexedDB is unavailable",async()=>{
 await assert.rejects(openCharacterLibrary(null),/IndexedDB is unavailable/);
});
test("new character IDs are nonempty and independently generated",()=>{
 const a=newCharacterId(),b=newCharacterId();
 assert.ok(a);
 assert.notEqual(a,b);
});
