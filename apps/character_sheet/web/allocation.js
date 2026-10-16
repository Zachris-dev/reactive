// Allocation rules are pure so the browser and tests share one implementation.
export const testPalette={category:"#e6b86a",skill:"#83c7ed"};
export const keyFor=(group,skill)=>JSON.stringify([String(group).trim().toLowerCase(),String(skill).replace(/\s*\([^)]*\)/g,"").trim().toLowerCase()]);
export function allocationsFromCampaign(campaign,cultureName){
 const culture=campaign.cultures.find(c=>c.name===cultureName);
 if(!culture)throw Error("Unknown culture "+cultureName);
 const common=(campaign.metadata.common?.statements||[]).map(s=>s.text);
 const custom=culture.statements.map(s=>s.text);
 const lines=culture.assignment?.toLowerCase()==="common"?common:custom;
 const pool=(type)=>lines.flatMap(line=>{
  const re=type==="category"?/^Category gain \[(\d+)\.\.(\d+)\]$/i:/^Base Skill gain \[(\d+)\.\.(\d+)\]$/i;
  const m=line.match(re);if(!m)return [];
  const start=+m[1],end=+m[2];if(end<start||end-start>1000)throw Error("Invalid allocation range");
  return Array.from({length:end-start+1},(_,i)=>start+i);
 });
 const required=[];
 for(const line of lines){
  const m=line.match(/^Base Skill assign require (Culture|Language)\/(.+?) = (\d+)$/i);
  if(m)required.push({group:m[1],skill:m[2],value:+m[3],line});
 }
 const cultureValue=lines.find(line=>/^Culture\/\{primary\} assign base \d+$/i.test(line));
 const languageValue=lines.find(line=>/^Language\/\{primary\} assign base \d+$/i.test(line));
 const initial=[];
 if(cultureValue)initial.push({group:"Culture",skill:culture.name,value:+cultureValue.match(/\d+$/)[0]});
 if(languageValue&&culture.primaryLanguage&&culture.primaryLanguage!=="*")
  initial.push({group:"Language",skill:culture.primaryLanguage,value:+languageValue.match(/\d+$/)[0]});
 // Custom cultural assignments must also populate the selected skills.
 // "assign require" specifies a granted starting value as well as a requirement.
 for(const r of required)initial.push({group:r.group,skill:r.skill,value:r.value});
 // Custom cultures without explicit grants still receive their native culture
 // and language. These can be reassigned like every other base value.
 if(!initial.some(r=>r.group==="Culture"))
  initial.push({group:"Culture",skill:culture.name,value:30});
 if(culture.primaryLanguage&&culture.primaryLanguage!=="*"&&!initial.some(r=>r.group==="Language"))
  initial.push({group:"Language",skill:culture.primaryLanguage,value:30});
 return {category:pool("category"),skill:pool("skill"),required,initial};
}
export function makeAllocationState(config){
 const skill={};
 for(const grant of config.initial){
  const target=keyFor(grant.group,grant.skill);
  skill[target]=grant.value;
 }
 // Each initial grant is a real token. Moving or removing it restores it
 // to the ordinary skill pool, never deleting or duplicating its value.
 return {category:{},skill,selected:null,config};
}
export function remaining(state,type){
 const spent=new Map();
 for(const n of Object.values(state[type]))spent.set(n,(spent.get(n)||0)+1);
 const pool=type==="skill"
  ?[...state.config.skill,...state.config.initial.map(r=>r.value)]
  :state.config.category;
 return pool.filter(n=>{
  const count=spent.get(n)||0;
  if(count>0){spent.set(n,count-1);return false;}
  return true;
 });
}
export function assign(state,type,target,value){
 if(!["category","skill"].includes(type)||!Number.isInteger(value))return false;
 if(!remaining(state,type).includes(value))return false;
 state[type][target]=value;
 return true;
}
export function remove(state,type,target){
 if(!["category","skill"].includes(type)||state[type][target]===undefined)return false;
 delete state[type][target];return true;
}
export function hasToken(state,type,value){return remaining(state,type).includes(value);}
export function skillBase(state,target){return state.skill[target];}
export function removeAssignment(state,type,target){return remove(state,type,target);}
export function allocationRequirements(state,culture,language){
 const issues=[];
 for(const [group,target] of [["Culture",culture],["Language",language]]){
  if(!target||target==="*")continue;
  const key=keyFor(group,target);
  const total=(skillBase(state,key)||0)+(state.category[group]||0);
  if(total<30)issues.push(group+"/"+target+" total "+total+" is below required 30");
 }
 for(const rule of state.config.required){
  const total=(skillBase(state,keyFor(rule.group,rule.skill))||0)+(state.category[rule.group]||0);
  if(total<rule.value)issues.push(rule.group+"/"+rule.skill+" total "+total+" is below required "+rule.value);
 }
 return issues;
}

export function humanBodyClassification(state,bodyGroup){
 const subgroupNames=["Strength","Finesse","Constitution"];
 const ranked=subgroupNames.map((name,index)=>{
  const subgroup=bodyGroup?.subgroups?.find(s=>s.name===name);
  const values=(subgroup?.skills||[]).map(s=>skillBase(state,keyFor("Body",s.name.replace(/\\s*\\([^)]*\\)/g,"").trim()))??0);
  return {name,index,max:Math.max(0,...values)};
 }).sort((a,b)=>b.max-a.max||a.index-b.index);
 // Always rank all three: as assignments change, primary and secondary follow
 // the highest base values; ties retain source subgroup order.
 const classification=Object.fromEntries(ranked.map((r,i)=>[r.name,["primary","secondary","tertiary"][i]]));
 const limits={primary:40,secondary:20,tertiary:10};
 const violations=ranked.filter(r=>r.max>limits[classification[r.name]]).map(r=>({subgroup:r.name,max:r.max,limit:limits[classification[r.name]]}));
 return {classification,violations,ranked};
}
