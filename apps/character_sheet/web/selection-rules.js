// Shared character-creation selection rules. Used by both UI and automated tests.
export function canonical(value){return String(value??"").trim().toLocaleLowerCase("en");}
export function selectionRules(parsedCampaign){
  return parsedCampaign.races.flatMap(race=>race.statements.flatMap(stmt=>{
    const match=stmt.text.match(/^Disallow:\s*(.+?)\s+selection\s+(.+)$/i);
    return match?[{selection:"race",value:canonical(race.name),disallow:{[canonical(match[1])]:[match[2].trim()]}}]:[];
  }));
}
export function buildCultureOptions(parsedCampaign){
  return parsedCampaign.cultures.map(c=>({
    id:c.name,label:c.name,barred:c.barred,
    allowedRaces:c.allows.length?c.allows:undefined,
    languages:c.primaryLanguage?[c.primaryLanguage]:[]
  }));
}
export function optionAvailable(campaign,chosen,group,option){
  const cultures=campaign.selections.find(s=>s.id==="culture")?.options??[];
  const selectedCulture=cultures.find(c=>canonical(c.id)===canonical(chosen.culture));
  if(group.id==="culture"){
    if(option.barred&&!option.allowedRaces?.length)return false;
    if(option.allowedRaces?.length&&chosen.race&&!option.allowedRaces.some(r=>canonical(r)===canonical(chosen.race)))return false;
  }
  if(group.id==="race"&&selectedCulture?.allowedRaces?.length&&!selectedCulture.allowedRaces.some(r=>canonical(r)===canonical(option.id)))return false;
  return !(campaign.restrictions??[]).some(rule=>
    canonical(chosen[rule.selection])===canonical(rule.value)&&
    (rule.disallow[group.id]??[]).some(v=>canonical(v)===canonical(option.id)));
}
export function selectionIssues(campaign,chosen){
  return campaign.selections.flatMap(group=>{
    const choice=chosen[group.id];
    if(!choice)return group.required?[{group:group.id,message:group.label+" is required"}]:[];
    const option=group.options.find(o=>canonical(o.id)===canonical(choice));
    if(!option)return [{group:group.id,message:group.label+" is not recognized: "+choice}];
    if(!optionAvailable(campaign,chosen,group,option))return [{group:group.id,message:group.label+" is unavailable: "+choice}];
    return [];
  });
}

export function optionConflicts(campaign,chosen,group,option){
 if(group.id==="culture"&&option.barred&&!option.allowedRaces?.length)return {barred:true,conflicts:[]};
 const proposed={...chosen,[group.id]:option.id};
 const conflicts=campaign.selections.filter(g=>g.id!==group.id&&chosen[g.id]&&
  !optionAvailable(campaign,proposed,g,g.options.find(o=>canonical(o.id)===canonical(chosen[g.id]))||{id:chosen[g.id]}))
  .map(g=>g.id);
 if(group.id==="magic"&&chosen.race&& !optionAvailable(campaign,chosen,group,option)&&!conflicts.includes("race"))conflicts.push("race");
 return {barred:false,conflicts};
}
export function chooseWithOverride(campaign,chosen,group,option){
 const {barred,conflicts}=optionConflicts(campaign,chosen,group,option);
 if(barred)return null;
 const next={...chosen,[group.id]:option.id};
 for(const id of conflicts)delete next[id];
 return next;
}
