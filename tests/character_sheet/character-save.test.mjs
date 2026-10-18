import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCampaign,parseSkillList} from "../../apps/character_sheet/web/template-parser.js";
import {allocationsFromCampaign,makeAllocationState,assign,keyFor} from "../../apps/character_sheet/web/allocation.js";
import {serializeCharacter,parseCharacterSave,restoreCharacterAllocation} from "../../apps/character_sheet/web/character-save.js";

const campaign=parseCampaign(readFileSync(new URL("../../campaigns/the-eldrich-race/campaign.txt",import.meta.url),"utf8"));
const definitions=parseSkillList(readFileSync(new URL("../../campaigns/the-eldrich-race/skills.txt",import.meta.url),"utf8")).categories;

test("character JSON is human-readable, recognizes format and computes highest Culture skill",()=>{
 const culture=campaign.cultures.find(c=>c.isDefault)||campaign.cultures.find(c=>!c.barred);
 const state=makeAllocationState(allocationsFromCampaign(campaign,culture.name));
 const cultureSkills=definitions.find(g=>g.name==="Culture").skills;
 const other=cultureSkills.find(s=>s.name!==culture.name);
 assert.ok(other,"Need an alternative culture skill");
 const first=keyFor("Culture",culture.name);
 const old=state.skill[first];
 delete state.skill[first];
 state.skill[keyFor("Culture",other.name)]=old;
 const saved=serializeCharacter({campaign:"Demo World",created:"2026-10-18",primary:{name:"Traveler",selectedCulture:culture.name,race:"Human"},allocation:state,definitions});
 const json=JSON.stringify(saved,null,2);
 assert.match(json,/^\{\n  "format": "Character sheet - Reactive 0\.88 - Demo World - Created 2026-10-18"/);
 assert.equal(saved.primary.mainCulture,other.name);
 assert.deepEqual(saved.extra,{equipment:[],money:{total:0,coins:[]},contacts:[],notes:[]});
 const loaded=parseCharacterSave(json,"Demo World");
 assert.deepEqual(restoreCharacterAllocation(loaded,allocationsFromCampaign(campaign,culture.name),definitions).skill,state.skill);
 assert.throws(()=>parseCharacterSave(json,"Other World"),/belongs to campaign/);
});
test("character JSON keeps xp, tp, extensions, and does not store zero-base skills",()=>{
 const culture=campaign.cultures.find(c=>c.isDefault)||campaign.cultures.find(c=>!c.barred);
 const state=makeAllocationState(allocationsFromCampaign(campaign,culture.name));
 const previous={
  primary:{home:"River Town",age:27,customField:"example"},
  skills:[{category:"Culture",skills:[{name:culture.name,base:30,xp:3,tp:8,magicalEnhancement:2}]}],
  extra:{equipment:[{name:"Staff",quantity:1,specialRules:"oak"}],notes:[{date:"2026-10-18",text:"Hello"}]},
  campaignExtension:{abilities:["Light"]}
 };
 const save=serializeCharacter({campaign:"Example",primary:{name:"Test"},allocation:state,definitions,previous});
 const entry=save.skills.find(b=>b.category==="Culture").skills.find(e=>e.name===culture.name);
 assert.equal(entry.xp,3);assert.equal(entry.tp,8);assert.equal(entry.magicalEnhancement,2);
 assert.equal(save.primary.home,"River Town");
 assert.deepEqual(save.campaignExtension,previous.campaignExtension);
 assert.equal(save.skills.some(b=>b.skills.some(e=>e.base===0)),false);
 assert.equal(save.extra.equipment[0].name,"Staff");
});
