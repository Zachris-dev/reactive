// Allocation rules are pure so the browser and tests share one implementation.
export const testPalette={category:"#e6b86a",skill:"#83c7ed"};
export const keyFor=(group,skill)=>JSON.stringify([group,skill]);
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
 if(cultureValue)required.push({group:"Culture",skill:culture.name,value:+cultureValue.match(/\d+$/)[0],fixed:true});
 if(languageValue&&culture.primaryLanguage&&culture.primaryLanguage!=="*")
  required.push({group:"Language",skill:culture.primaryLanguage,value:+languageValue.match(/\d+$/)[0],fixed:true});
 return {category:pool("category"),skill:pool("skill"),required};
}
export function makeAllocationState(config){
 return {category:{},skill:{},fixed:Object.fromEntries(config.required.filter(r=>r.fixed).map(r=>[keyFor(r.group,r.skill),r.value])),selected:null,config};
}
export function remaining(state,type){
 const spent=Object.values(state[type]);
 const count=new Map();
 for(const n of spent)count.set(n,(count.get(n)||0)+1);
 return state.config[type].filter(n=>{
  const available=count.get(n)||0;
  if(available>0){count.set(n,available-1);return false;}
  return true;
 });
}
export function assign(state,type,target,value){
 if(!["category","skill"].includes(type))return false;
 if(!Number.isInteger(value)||!remaining(state,type).includes(value))return false;
 if(state[type][target]!==undefined||type==="skill"&&state.fixed[target]!==undefined)return false; // Explicit removal prevents silent swaps.
 state[type][target]=value;return true;
}
export function remove(state,type,target){
 if(!["category","skill"].includes(type)||state[type][target]===undefined)return false;
 delete state[type][target];return true;
}
export function hasToken(state,type,value){return remaining(state,type).includes(value);}
