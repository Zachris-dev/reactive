// Run with: node --test tests/character_sheet/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCampaign,parseSkillList,validateCampaign,matchName} from "../../apps/character_sheet/web/template-parser.js";
import {selectionRules,buildCultureOptions,optionAvailable,selectionIssues} from "../../apps/character_sheet/web/selection-rules.js";
const root=new URL("../../campaigns/the-eldrich-race/",import.meta.url);
const campaignText=readFileSync(new URL("campaign.txt",root),"utf8");
const skillsText=readFileSync(new URL("skills.txt",root),"utf8");
const parsed=parseCampaign(campaignText);
const skills=parseSkillList(skillsText);
const magic=skills.categories.find(c=>c.name==="Magic");
const campaign={
 selections:[
  {id:"culture",label:"Culture",required:true,options:buildCultureOptions(parsed)},
  {id:"race",label:"Race",required:true,options:parsed.races.map(r=>({id:r.name,label:r.name}))},
  {id:"magic",label:"Magic",required:true,options:magic.alternatives.map(a=>({id:a.name,label:a.name}))}
 ],
 restrictions:selectionRules(parsed)
};
const options=id=>campaign.selections.find(s=>s.id===id);
const can=(chosen,group,name)=>optionAvailable(campaign,chosen,options(group),options(group).options.find(o=>matchName(o.id)===matchName(name)));
test("skill list has 12 groups of 10 and four 10-skill magic alternatives",()=>{
 assert.equal(skills.categories.length,12);
 assert.equal(skills.issues.filter(x=>x.severity==="error").length,0,JSON.stringify(skills.issues));
 assert.equal(magic.alternatives.length,4);
});
test("parentheses are only descriptive for matching",()=>{
 assert.equal(matchName("Squall (seafolk)"),matchName("Squall"));
 assert.equal(matchName("Merchants (signs, bookkeeping)"),matchName("Merchants"));
});
test("parser recognizes race exclusion from actual campaign file",()=>{
 assert.deepEqual(selectionRules(parsed).filter(r=>matchName(r.value)==="elf"),[
  {selection:"race",value:"elf",disallow:{magic:["Physical Adept"]}}
 ]);
});
test("elf cannot choose Physical Adept, but can choose Arcane",()=>{
 assert.equal(can({race:"Elf"},"magic","Physical Adept"),false);
 assert.equal(can({race:"Elf"},"magic","Arcane"),true);
});
test("human can choose Physical Adept",()=>assert.equal(can({race:"human"},"magic","Physical Adept"),true));
test("changing race invalidates previously chosen magic; order does not bypass restrictions",()=>{
 const chosen={culture:"High Emeri",race:"human",magic:"Physical Adept"};
 assert.deepEqual(selectionIssues(campaign,chosen),[]);
 chosen.race="Elf";
 assert.equal(selectionIssues(campaign,chosen).some(x=>x.group==="magic"),true);
});
test("Vaelthar only permits Elf, Kardsworn only Dwarf, Herisian Human or Elf",()=>{
 assert.equal(can({race:"Human"},"culture","Vaelthar"),false);
 assert.equal(can({race:"Elf"},"culture","Vaelthar"),true);
 assert.equal(can({race:"Elf"},"culture","Kardsworn"),false);
 assert.equal(can({race:"Dwarf"},"culture","Kardsworn"),true);
 assert.equal(can({race:"Dwarf"},"culture","Herisian"),false);
 assert.equal(can({race:"Elf"},"culture","Herisian"),true);
});
test("barred cultures without Allow remain unavailable",()=>{
 assert.equal(can({race:"Human"},"culture","Norr"),false);
 assert.equal(can({race:"Elf"},"culture","Razyg"),false);
});
test("race options also respect culture restrictions",()=>{
 assert.equal(can({culture:"Vaelthar"},"race","Elf"),true);
 assert.equal(can({culture:"Vaelthar"},"race","Human"),false);
});
test("current intentionally misspelled Vealan reference is detected with line number",()=>{
 const errors=validateCampaign(parsed,skills).filter(x=>x.severity==="error");
 assert.ok(errors.some(x=>x.message.includes("Vealan Elvish")&&x.line>0),JSON.stringify(errors));
});
test("Norr absence from Culture skill list produces a warning",()=>{
 const issues=validateCampaign(parsed,skills);
 assert.ok(issues.some(x=>x.severity==="warning"&&x.message.includes("Norr")),JSON.stringify(issues));
});
test("barred incomplete cultures are notes rather than errors",()=>{
 const notes=validateCampaign(parsed,skills);
 assert.ok(notes.some(x=>x.severity==="info"&&x.message.includes("Razyg")&&x.message.includes("primary language")));
 assert.equal(notes.some(x=>x.severity==="error"&&x.message.includes('Culture "Razyg"')),false);
});
test("a missing language on a playable culture is an error",()=>{
 const altered=parseCampaign(campaignText.replace(/(Primary Culture: High Emeri\s*)Primary Language: Emerspeak/,"$1"));
 const issues=validateCampaign(altered,skills);
 assert.ok(issues.some(x=>x.severity==="error"&&x.message.includes('Culture "High Emeri" has no primary language')));
});
test("structurally invalid skill list is rejected",()=>{
 const changed=skillsText.replace(/^\s*Nonverbal\s*$/m,"");
 const result=parseSkillList(changed);
 assert.ok(result.issues.some(i=>i.severity==="error"&&i.message.includes("Social")));
});
