// Compact, grouped output for character creation test suites.
// Successful suites get one summary line; failing suites include full Node diagnostics.
import {spawnSync} from "node:child_process";

const groups={
  parser:[["Campaign parser and selection","tests/character_sheet/parser-and-selection.test.mjs"]],
  creation:[
    ["Campaign parser and selection","tests/character_sheet/parser-and-selection.test.mjs"],
    ["Character creation and allocation","tests/character_sheet/allocation.test.mjs"],
    ["Character save and load","tests/character_sheet/character-save.test.mjs"]
  ]
};
const mode=process.argv[2]||"creation";
if(!groups[mode]){console.error("Usage: node tests/character_sheet/run-grouped.mjs [parser|creation]");process.exit(2);}
let total=0,passed=0,failed=0;
console.log("\n=== Reactive character tests ===\n");
for(const [label,file] of groups[mode]){
 console.log("--- "+label+" ---");
 const run=spawnSync(process.execPath,["--test","--test-reporter=tap",file],{encoding:"utf8",maxBuffer:8*1024*1024});
 const output=(run.stdout||"").trim();
 const metric=label=>Number(output.match(new RegExp("^# "+label+" (\\d+)$","m"))?.[1]||0);
 const count=metric("tests"),pass=metric("pass"),fail=metric("fail");
 total+=count;passed+=pass;failed+=fail;
 if(run.status===0){
  console.log("PASS: "+pass+" tests");
 }else{
  console.log("FAIL: "+fail+" failed out of "+count+" tests");
  // Keep complete diagnostics when a section fails: assertion locations and diffs matter.
  if(output)console.log(output);
  if(run.stderr?.trim())console.error(run.stderr.trim());
  if(run.error)console.error(run.error.message);
  if(!fail)failed++;
 }
 console.log("");
}
console.log("=== Character test summary: "+passed+" passed, "+failed+" failed ("+total+" tests) ===\n");
if(failed)process.exitCode=1;
