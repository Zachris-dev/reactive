import {readFileSync} from "node:fs";
import {parseCampaign,parseSkillList,validateCampaign} from "../../apps/character_sheet/web/template-parser.js";
const campaign=readFileSync("campaigns/the-eldrich-race/campaign.txt","utf8");
const skills=readFileSync("campaigns/the-eldrich-race/skills.txt","utf8");
const results=validateCampaign(parseCampaign(campaign),parseSkillList(skills));
const counts={error:0,warning:0,info:0};
for(const entry of results){
  counts[entry.severity]=(counts[entry.severity]||0)+1;
  console.log(`${entry.severity.toUpperCase()} ${entry.file}:${entry.line} — ${entry.message}`);
}
console.log(`Campaign validation: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} notes.`);
if(counts.error)process.exitCode=1;
