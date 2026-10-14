// Reactive campaign text parsers. No browser dependencies.
export function matchName(name){return name.replace(/\s*\([^)]*\)/g,"").trim().toLowerCase();}
const diagnostic=(severity,file,line,message)=>({severity,file,line,message});
export function parseSkillList(text){
 const issues=[],categories=[];let category=null,section=null;
 text.split(/\r?\n/).forEach((raw,i)=>{
  const line=raw.trim();if(!line)return;
  const head=line.match(/^(\d+)\.\s+(.+)$/);
  if(head){category={number:Number(head[1]),name:head[2].trim(),line:i+1,skills:[],subgroups:[],alternatives:[]};categories.push(category);section=null;return;}
  if(!category)return;
  const alternate=line.match(/^\[\s*(?:.+?\s*-\s*)?alternate choice\s+\d+\s*:\s*(.+?)\s*\]$/i);
  if(alternate){section={name:alternate[1],line:i+1,skills:[]};category.alternatives.push(section);return;}
  const subgroup=line.match(/^\((.+?)\s*\/\s*(.+?)\)$/);
  if(subgroup){section={name:subgroup[2],line:i+1,skills:[]};category.subgroups.push(section);return;}
  if(/^\[|^\(/.test(line)){issues.push(diagnostic("error","skills",i+1,"Unrecognized structural instruction: "+line));return;}
  const entry={name:line,description:"",line:i+1};
  (section?section.skills:category.skills).push(entry);
 });
 if(categories.length!==12)issues.push(diagnostic("error","skills",1,`Expected 12 categories, found ${categories.length}`));
 const seen=new Set();
 for(const c of categories){
  if(seen.has(matchName(c.name)))issues.push(diagnostic("error","skills",c.line,"Duplicate category "+c.name));
  seen.add(matchName(c.name));
  const variants=c.alternatives.length?c.alternatives:c.subgroups.length?[{name:c.name,line:c.line,skills:c.subgroups.flatMap(s=>s.skills)}]:[c];
  for(const v of variants)if(v.skills.length!==10)issues.push(diagnostic("error","skills",v.line,`${c.name}/${v.name}: expected 10 skills, found ${v.skills.length}`));
  if(c.alternatives.length&&c.subgroups.length)issues.push(diagnostic("error","skills",c.line,"Cannot mix alternatives and subgroups in "+c.name));
 }
 return {categories,issues};
}
export function parseCampaign(text){
 const issues=[],cultures=[],races=[],rules=[],selections=[],metadata={};let context=null;
 const known=/^(?:Skill List|Rule|Creation Rule|Common assignment|Culture\/|Language\/|Category gain|Base Skill gain|Base Skill assign|Race|Choice|Determined|Senses|Skill change|Disallow|Barred culture|Primary Culture|Barred|Allow|Primary Language|Assignment|Rule change|Creation Rule change)/i;
 text.split(/\r?\n/).forEach((raw,i)=>{
  const value=raw.trim(),line=i+1;if(!value)return;
  const culture=value.match(/^Primary Culture:\s*(.+)$/i);
  const race=value.match(/^Race:\s*(.+)$/i);
  if(culture){context={name:culture[1].trim(),line,barred:false,allows:[],primaryLanguage:null,assignment:null,statements:[]};cultures.push(context);return;}
  if(race){context={name:race[1].trim(),line,statements:[]};races.push(context);return;}
  if(/^Common assignment:/i.test(value)){context={name:"Common",statements:[]};metadata.common=context;return;}
  if(/^Skill List:/i.test(value)){metadata.skillList=value.slice(value.indexOf(":")+1).trim();return;}
  if(/^div:/i.test(value)){metadata.division=value;return;}
  if(/^Barred culture:/i.test(value)){metadata.barredDefinition=value;return;}
  if(context&&"barred" in context){
   if(/^Barred$/i.test(value)){context.barred=true;return;}
   if(/^Allow\s*:?[ \t]+/i.test(value)){context.allows.push(...value.replace(/^Allow\s*:?[ \t]+/i,"").split(",").map(x=>x.trim()));return;}
   if(/^Primary Language:/i.test(value)){context.primaryLanguage=value.split(":").slice(1).join(":").trim();return;}
   if(/^Assignment:/i.test(value)){context.assignment=value.split(":").slice(1).join(":").trim();return;}
  }
  const statement={text:value,line};
  if(context)context.statements.push(statement);
  else rules.push(statement);
  if(!known.test(value)&&!/^div:/i.test(value))issues.push(diagnostic("warning","campaign",line,"Unrecognized statement: "+value));
 });
 return {cultures,races,rules,metadata,issues};
}
export function validateCampaign(campaign,skillList){
 const issues=[...campaign.issues,...skillList.issues];
 const cultureGroup=skillList.categories.find(c=>matchName(c.name)==="culture");
 const languageGroup=skillList.categories.find(c=>matchName(c.name)==="language");
 const names=entries=>new Set((entries||[]).map(s=>matchName(s.name)));
 const cultureNames=names(cultureGroup?.skills),languageNames=names(languageGroup?.skills);
 const raceNames=new Set(campaign.races.map(r=>matchName(r.name)));
 for(const c of campaign.cultures){
  const playable=!c.barred||c.allows.length>0;
  if(!cultureNames.has(matchName(c.name)))issues.push(diagnostic("warning","campaign",c.line,`Culture "${c.name}" is absent from Culture skills`));
  if(!c.primaryLanguage)issues.push(diagnostic(playable?"error":"info","campaign",c.line,`Culture "${c.name}" has no primary language`));
  else if(c.primaryLanguage!=="*"&&!languageNames.has(matchName(c.primaryLanguage)))issues.push(diagnostic("error","campaign",c.line,`Primary language "${c.primaryLanguage}" is absent from Language skills`));
  if(!c.assignment&&!c.statements.some(s=>/^(?:Category gain|Base Skill gain)/i.test(s.text)))issues.push(diagnostic(playable?"warning":"info","campaign",c.line,`Culture "${c.name}" has no explicit common or custom assignment`));
  for(const allowed of c.allows)if(!raceNames.has(matchName(allowed)))issues.push(diagnostic("error","campaign",c.line,`Unknown allowed race "${allowed}"`));
 }
 for(const c of campaign.cultures){
  for(const stmt of c.statements){
   const m=stmt.text.match(/(?:Culture|Language)\/([^=\s]+(?:\s+[^=\s]+)*)\s*=\s*\d+\s*$/i);
   if(!m)continue;
   const group=stmt.text.match(/(?:Culture|Language)\//i)[0].startsWith("Culture")?"Culture":"Language";
   const target=m[1].trim();
   if(!names(skillList.categories.find(g=>g.name===group)?.skills).has(matchName(target)))
    issues.push(diagnostic("error","campaign",stmt.line,`Reference "${group}/${target}" is missing from skill list`));
  }
 }
 return issues;
}
