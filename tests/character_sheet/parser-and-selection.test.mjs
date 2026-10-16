// Run with: node --test tests/character_sheet/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCampaign,parseSkillList,validateCampaign,matchName} from "../../apps/character_sheet/web/template-parser.js";
import {selectionRules,buildCultureOptions,optionAvailable,selectionIssues,optionConflicts,chooseWithOverride} from "../../apps/character_sheet/web/selection-rules.js";
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
test("misspelled Vaelthar skill reference is detected with line number",()=>{
 const altered=parseCampaign(campaignText.replace("Language/Vaelan Elvish = 35","Language/Vealan Elvish = 35"));
 const errors=validateCampaign(altered,skills).filter(x=>x.severity==="error");
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

test("unknown standalone directives generate line-numbered warnings",()=>{
 const changed=campaignText.replace(/Primary Culture: High Emeri/, "Primary Culture: High Emeri\nMysterious invention");
 const issue=parseCampaign(changed).issues.find(i=>i.message.includes("Mysterious invention"));
 assert.equal(issue?.severity,"warning");
 assert.ok(issue.line>0);
});
test("Default is recognized for cultures, without unknown directive warnings",()=>{
 const changed=campaignText.replace(/Primary Culture: High Emeri/, "Primary Culture: High Emeri\nDefault");
 const model=parseCampaign(changed);
 assert.equal(model.cultures.find(c=>c.name==="High Emeri").isDefault,true);
 assert.equal(model.issues.some(i=>i.message.includes("Default")),false);
});
test("misspelled primary language is a validation error for a playable culture",()=>{
 const changed=campaignText.replace(/(Primary Culture: Low Emeri\s*Barred\s*Allow Human\s*Primary Language: )Emerspeak/i,"$1Emmspeak");
 const issues=validateCampaign(parseCampaign(changed),skills);
 assert.ok(issues.some(i=>i.severity==="error"&&i.message.includes("Emmspeak")),JSON.stringify(issues));
});
test("two default cultures cause an error",()=>{
 const changed=campaignText.replace(/Primary Culture: High Emeri/,"Primary Culture: High Emeri\nDefault").replace(/Primary Culture: Revangelism/,"Primary Culture: Revangelism\nDefault");
 assert.ok(validateCampaign(parseCampaign(changed),skills).some(i=>i.severity==="error"&&i.message.includes("More than one default")));
});

test("campaign defaults are High Emeri and human",()=>{
 assert.equal(parsed.cultures.find(c=>c.isDefault)?.name,"High Emeri");
 assert.equal(parsed.races.find(r=>r.statements.some(s=>/^Default$/i.test(s.text)))?.name.toLowerCase(),"human");
});
test("overriding Vaelthar removes incompatible Human",()=>{
 const chosen={race:"Human",culture:"High Emeri",magic:"Arcane"};
 const group=options("culture"),option=group.options.find(o=>o.id==="Vaelthar");
 assert.deepEqual(optionConflicts(campaign,chosen,group,option).conflicts,["race"]);
 assert.deepEqual(chooseWithOverride(campaign,chosen,group,option),{culture:"Vaelthar",magic:"Arcane"});
});
test("overriding Elf removes incompatible culture and magic",()=>{
 const chosen={culture:"Low Emeri",race:"Human",magic:"Physical Adept"};
 const group=options("race"),option=group.options.find(o=>o.id==="Elf");
 assert.deepEqual(optionConflicts(campaign,chosen,group,option).conflicts,["culture","magic"]);
 assert.deepEqual(chooseWithOverride(campaign,chosen,group,option),{race:"Elf"});
});
test("entirely barred culture cannot be chosen",()=>{
 const group=options("culture"),option=group.options.find(o=>o.id==="Norr");
 assert.equal(optionConflicts(campaign,{race:"Human"},group,option).barred,true);
 assert.equal(chooseWithOverride(campaign,{race:"Human"},group,option),null);
});
