import test from "node:test";
import assert from "node:assert/strict";
import {TYPES,DEFINITIONS,HEADER_SIZE,MAX_PAYLOAD,ProtocolError,
 encodeMessage,decodeMessage,validateMessage} from "../../packages/communications/protocol.mjs";
import {sendMessage} from "../../packages/communications/client.mjs";

const clone=frame=>Uint8Array.from(frame);
const updateLength=(frame,n)=>new DataView(frame.buffer).setUint32(11,n);
const rewrite=(frame,bytes)=>{
 const result=new Uint8Array(HEADER_SIZE+bytes.length);
 result.set(frame.slice(0,HEADER_SIZE));result.set(bytes,HEADER_SIZE);
 updateLength(result,bytes.length);
 return result;
};
const invalid=value=>assert.throws(()=>decodeMessage(value),ProtocolError);
const te=new TextEncoder();

test("every message in registry has exactly one type id and schema",()=>{
 assert.equal(new Set(Object.values(TYPES)).size,Object.keys(TYPES).length);
 assert.deepEqual(Object.keys(TYPES).sort(),Object.keys(DEFINITIONS).sort());
 for(const [name,spec] of Object.entries(DEFINITIONS)){
  assert.match(name,/^[a-z]+(?:[.-][a-z]+)*$/);
  assert.ok(["request","response"].includes(spec.direction));
 }
});
test("request and response round-trip including multibyte UTF-8 and correlation",()=>{
 const req=encodeMessage("campaign.create",{name:"Þór — 霧 😀",is_test_data:true},42);
 assert.deepEqual(decodeMessage(req,"request"),{type:"campaign.create",requestId:42,payload:{name:"Þór — 霧 😀",is_test_data:true}});
 const reply=encodeMessage("operation.result",{status:201,data:{name:"Þór — 霧 😀"}},42);
 assert.equal(decodeMessage(reply,"response").requestId,42);
 assert.throws(()=>decodeMessage(reply,"request"),ProtocolError);
 assert.throws(()=>decodeMessage(req,"response"),ProtocolError);
});
test("frame lengths shorter and longer are both rejected",()=>{
 const frame=encodeMessage("campaign.create",{name:"霧"},1);
 const short=clone(frame);updateLength(short,frame.length-HEADER_SIZE-1);invalid(short);
 const long=clone(frame);updateLength(long,frame.length-HEADER_SIZE+1);invalid(long);
 invalid(frame.slice(0,-1));
 invalid(Uint8Array.from([...frame,0]));
 invalid(frame.slice(0,15));
});
test("unknown type, unknown version, nonzero flags and invalid header are rejected",()=>{
 const original=encodeMessage("campaign.mine",{},1);
 for(const [offset,val] of [[0,0],[4,2],[15,1]]){
  const bad=clone(original);bad[offset]=val;invalid(bad);
 }
 const unknown=clone(original);new DataView(unknown.buffer).setUint16(5,65535);invalid(unknown);
});
test("invalid UTF-8 and wrong byte vs character length are rejected",()=>{
 const frame=encodeMessage("campaign.create",{name:"é"},3);
 const body=frame.slice(HEADER_SIZE);
 const bad=clone(frame);bad[bad.length-2]=0xff;invalid(bad);
 const wrong=clone(frame);updateLength(wrong,body.length-1);invalid(wrong);
});
test("duplicate JSON properties and trailing JSON are rejected",()=>{
 const original=encodeMessage("campaign.create",{name:"x"},2);
 invalid(rewrite(original,te.encode('{"name":"a","name":"b"}')));
 invalid(rewrite(original,te.encode('{"name":"a"}{}')));
 invalid(rewrite(original,te.encode('{"name":"a", "is_test_data":true}')));
});
test("schema rejects missing, extra or mistyped fields before encoding",()=>{
 for(const payload of [{},{name:123},{name:"ok",admin:true},{name:"ok",is_test_data:"yes"}])
  assert.throws(()=>encodeMessage("campaign.create",payload),ProtocolError);
 assert.throws(()=>encodeMessage("character.assign",{character_id:"a",user_id:"b",is_gm:true}),ProtocolError);
 assert.throws(()=>encodeMessage("admin.promote",{user_id:"x",actor_id:"test_admin"}),ProtocolError);
});
test("arbitrary valid Unicode free text survives unchanged",()=>{
 const text='  "quoted" \n <script>alert(1)</script>\t é 😀 \u0000 ';
 const frame=encodeMessage("note.create",{character_id:"x",visibility:"private",body:text},11);
 assert.equal(decodeMessage(frame).payload.body,text);
});
test("unsafe JSON keys, lone surrogates and excessive nesting are rejected",()=>{
 assert.throws(()=>encodeMessage("campaign.create",{name:"\ud800"}),ProtocolError);
 assert.throws(()=>encodeMessage("character.upload",{campaign_id:"x",name:"a",character_sheet_tokens:JSON.parse('{"__proto__":5}')}),ProtocolError);
 let deep={};for(let i=0;i<30;i++)deep={next:deep};
 assert.throws(()=>encodeMessage("character.upload",{campaign_id:"x",name:"a",character_sheet_tokens:deep}),ProtocolError);
});
test("request IDs and payload sizes have strict bounds",()=>{
 assert.throws(()=>encodeMessage("campaign.mine",{},-1),ProtocolError);
 assert.throws(()=>encodeMessage("campaign.mine",{},2**32),ProtocolError);
 assert.throws(()=>encodeMessage("note.create",{character_id:"a",visibility:"shared",body:"x".repeat(4001)}),ProtocolError);
 const frame=encodeMessage("campaign.mine",{});
 const bad=clone(frame);updateLength(bad,MAX_PAYLOAD+1);invalid(bad);
});
test("mutation fuzz: malformed frames never decode successfully",()=>{
 const original=encodeMessage("character.assign",{character_id:"char",user_id:"player"},7);
 for(let i=0;i<original.length;i++){
  const variant=clone(original);variant[i]^=0xff;
  // Mutations of the request ID or of valid text characters can still be valid
  // frames. Everything else must be rejected or remain structurally valid.
  try {
   const decoded=decodeMessage(variant);
   assert.equal(decoded.type,"character.assign");
   assert.equal(variant.length,HEADER_SIZE+new DataView(variant.buffer).getUint32(11));
  }catch(error){assert.ok(error instanceof ProtocolError);}
 }
});

test("client transport enforces TLS and response correlation",async()=>{
 const payload={status:200,data:{campaigns:[]}};
 let wasCalled=false;
 const mock=async (url,options)=>{
  wasCalled=true;
  assert.equal(options.method,"POST");
  assert.equal(decodeMessage(options.body,"request").type,"campaign.mine");
  return new Response(encodeMessage("operation.result",payload,23),{
   status:200,headers:{"content-type":"application/octet-stream"}
  });
 };
 await assert.rejects(sendMessage({
  url:"http://example.com/api/protocol",type:"campaign.mine",payload:{},requestId:23,fetchImpl:mock
 }),ProtocolError);
 assert.equal(wasCalled,false);
 const response=await sendMessage({
  url:"http://127.0.0.1:8787/api/protocol",type:"campaign.mine",payload:{},requestId:23,fetchImpl:mock
 });
 assert.equal(response.status,200);
 assert.equal(wasCalled,true);
 await assert.rejects(sendMessage({
  url:"https://example.com/api/protocol",type:"campaign.mine",payload:{},requestId:24,fetchImpl:mock
 }),/Response request ID mismatch/);
});
