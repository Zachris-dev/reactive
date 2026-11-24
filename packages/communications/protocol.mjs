// Reactive protocol v1. Shared by clients and server. Zero third-party dependencies.
// The protocol encodes data; it is NOT authentication, encryption or authorization.
// Wire: "RCTV" (4), version u8, message type u16 BE, request id u32 BE,
// payload byte length u32 BE, reserved flags u8=0, UTF-8 JSON payload.
export const VERSION=1;
export const HEADER_SIZE=16;
export const MAX_PAYLOAD=65536;
const encoder=new TextEncoder();
const decoder=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true});
const names=Object.freeze({
  "campaign.list":1,"campaign.mine":2,"campaign.create":3,
  "campaign.members":4,"invitation.create":5,"invitation.accept":6,
  "character.list":7,"character.list-all":8,"character.upload":9,
  "character.read":10,"character.assign":11,"note.list":12,
  "note.create":13,"account.me":14,"admin.users":15,
  "admin.promote":16,"admin.revoke":17,"admin.gm-recover":18,
  "character.replace":19,"character.revisions":20,
  "note.replace":21,"note.revisions":22,
  "operation.result":100
});
export const TYPES=names;
const reverse=new Map(Object.entries(names).map(([name,id])=>[id,name]));
const str=(max=128,min=1)=>({kind:"string",max,min});
const num=(min=0,max=1000000)=>({kind:"number",min,max});
const bool={kind:"boolean"};
const anyJson={kind:"json"};
const object=(required={},optional={})=>({kind:"object",required,optional});
export const DEFINITIONS=Object.freeze({
 "campaign.list":{direction:"request",schema:object({},{admin:bool,fixtures:bool})},
 "campaign.mine":{direction:"request",schema:object()},
 "campaign.create":{direction:"request",schema:object({name:str(100)},{is_test_data:bool})},
 "campaign.members":{direction:"request",schema:object({campaign_id:str()},{fixtures:bool})},
 "invitation.create":{direction:"request",schema:object({campaign_id:str(),kind:{kind:"enum",values:["player","group","gm"]}},{expires_days:num(1,30),max_uses:num(1,100),fixtures:bool})},
 "invitation.accept":{direction:"request",schema:object({token:str(64,64)},{fixtures:bool})},
 "character.list":{direction:"request",schema:object({campaign_id:str()},{fixtures:bool})},
 "character.list-all":{direction:"request",schema:object()},
 "character.upload":{direction:"request",schema:object({campaign_id:str(),name:str(100),character_sheet_tokens:anyJson},{fixtures:bool})},
 "character.read":{direction:"request",schema:object({character_id:str()},{fixtures:bool})},
 "character.replace":{direction:"request",schema:object({character_id:str(),operation_id:str(36,36),expected_version:num(1,2147483647),name:str(100),character_sheet_tokens:anyJson},{fixtures:bool})},
 "character.revisions":{direction:"request",schema:object({character_id:str()},{fixtures:bool,before_version:num(2,2147483647)})},
 "character.assign":{direction:"request",schema:object({character_id:str(),user_id:str()},{fixtures:bool})},
 "note.list":{direction:"request",schema:object({character_id:str()},{fixtures:bool})},
 "note.create":{direction:"request",schema:object({character_id:str(),visibility:{kind:"enum",values:["private","shared"]},body:str(4000,1)},{fixtures:bool})},
 "note.replace":{direction:"request",schema:object({note_id:str(),operation_id:str(36,36),expected_version:num(1,2147483647),body:str(4000,0)},{fixtures:bool})},
 "note.revisions":{direction:"request",schema:object({note_id:str()},{fixtures:bool,before_version:num(2,2147483647)})},
 "account.me":{direction:"request",schema:object()},
 "admin.users":{direction:"request",schema:object({},{fixtures:bool})},
 "admin.promote":{direction:"request",schema:object({user_id:str()},{fixtures:bool})},
 "admin.revoke":{direction:"request",schema:object({user_id:str()},{fixtures:bool})},
 "admin.gm-recover":{direction:"request",schema:object({campaign_id:str(),user_id:str()},{fixtures:bool})},
 "operation.result":{direction:"response",schema:object({status:num(100,599),data:anyJson})}
});
export class ProtocolError extends Error {
 constructor(message){super(message);this.name="ProtocolError";}
}
function validUnicode(value){
 // JavaScript can hold lone UTF-16 surrogates; reject them rather than silently
 // replacing them with U+FFFD during UTF-8 encoding.
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c>=0xD800&&c<=0xDBFF){
   const next=value.charCodeAt(++i);
   if(!(next>=0xDC00&&next<=0xDFFF))throw new ProtocolError("Unpaired surrogate");
  }else if(c>=0xDC00&&c<=0xDFFF)throw new ProtocolError("Unpaired surrogate");
 }
}
function validate(value,schema,depth=0){
 if(depth>24)throw new ProtocolError("Excessive nesting");
 if(schema.kind==="string"){
  if(typeof value!=="string"||Array.from(value).length<schema.min||Array.from(value).length>schema.max)
   throw new ProtocolError("Invalid string");
  validUnicode(value);return;
 }
 if(schema.kind==="number"){
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<schema.min||value>schema.max)
   throw new ProtocolError("Invalid number");
  return;
 }
 if(schema.kind==="boolean"){
  if(typeof value!=="boolean")throw new ProtocolError("Invalid boolean");return;
 }
 if(schema.kind==="enum"){
  if(!schema.values.includes(value))throw new ProtocolError("Invalid enum");return;
 }
 if(schema.kind==="object"){
  if(value===null||typeof value!=="object"||Array.isArray(value))throw new ProtocolError("Expected object");
  const allowed={...schema.required,...schema.optional};
  for(const key of Object.keys(schema.required))if(!Object.hasOwn(value,key))
   throw new ProtocolError("Missing field: "+key);
  for(const key of Object.keys(value)){
   if(!Object.hasOwn(allowed,key))throw new ProtocolError("Unexpected field: "+key);
   validate(value[key],allowed[key],depth+1);
  }
  return;
 }
 if(schema.kind==="json"){
  if(value===null||typeof value==="boolean")return;
  if(typeof value==="number"){
   if(!Number.isFinite(value))throw new ProtocolError("Invalid JSON number");
  }else if(typeof value==="string"){validUnicode(value);}
  else if(Array.isArray(value)){
   if(value.length>4096)throw new ProtocolError("Array too large");
   for(const item of value)validate(item,schema,depth+1);
  }else if(value&&typeof value==="object"){
   if(Object.keys(value).length>4096)throw new ProtocolError("Too many fields");
   for(const [key,item] of Object.entries(value)){
    validUnicode(key);
    if(["__proto__","constructor","prototype"].includes(key))throw new ProtocolError("Unsafe JSON key");
    validate(item,schema,depth+1);
   }
  }else throw new ProtocolError("Invalid JSON value");
  return;
 }
 throw new ProtocolError("Unknown field schema");
}
export function validateMessage(type,payload){
 const definition=DEFINITIONS[type];
 if(!definition)throw new ProtocolError("Unknown message type");
 validate(payload,definition.schema);
 return payload;
}
function bytes(input){
 if(input instanceof Uint8Array)return input;
 if(input instanceof ArrayBuffer)return new Uint8Array(input);
 throw new ProtocolError("Expected binary frame");
}
export function encodeMessage(type,payload,requestId=0){
 if(!Object.hasOwn(TYPES,type))throw new ProtocolError("Unknown message type");
 if(!Number.isSafeInteger(requestId)||requestId<0||requestId>0xffffffff)
  throw new ProtocolError("Invalid request id");
 validateMessage(type,payload);
 const json=JSON.stringify(payload);
 const data=encoder.encode(json);
 if(data.byteLength>MAX_PAYLOAD)throw new ProtocolError("Payload too large");
 const frame=new Uint8Array(HEADER_SIZE+data.byteLength);
 frame.set([82,67,84,86],0);
 const view=new DataView(frame.buffer);
 view.setUint8(4,VERSION);
 view.setUint16(5,TYPES[type]);
 view.setUint32(7,requestId);
 view.setUint32(11,data.byteLength);
 view.setUint8(15,0);
 frame.set(data,HEADER_SIZE);
 return frame;
}
export function decodeMessage(input,expectedDirection=null){
 const frame=bytes(input);
 if(frame.byteLength<HEADER_SIZE)throw new ProtocolError("Truncated header");
 if(frame[0]!==82||frame[1]!==67||frame[2]!==84||frame[3]!==86)
  throw new ProtocolError("Invalid magic");
 const view=new DataView(frame.buffer,frame.byteOffset,frame.byteLength);
 if(view.getUint8(4)!==VERSION)throw new ProtocolError("Unsupported protocol version");
 const type=reverse.get(view.getUint16(5));
 if(!type)throw new ProtocolError("Unknown message type");
 if(view.getUint8(15)!==0)throw new ProtocolError("Unsupported flags");
 if(expectedDirection&&DEFINITIONS[type].direction!==expectedDirection)
  throw new ProtocolError("Invalid message direction");
 const length=view.getUint32(11);
 if(length>MAX_PAYLOAD)throw new ProtocolError("Payload too large");
 if(frame.byteLength!==HEADER_SIZE+length)throw new ProtocolError("Payload length mismatch");
 let json;
 try{json=decoder.decode(frame.subarray(HEADER_SIZE));}
 catch{throw new ProtocolError("Invalid UTF-8");}
 let payload;
 try{payload=JSON.parse(json);}
 catch{throw new ProtocolError("Invalid JSON");}
 // The shared encoder always emits canonical compact JSON. Requiring a
 // byte-exact round trip also rejects duplicate keys and ambiguous escapes.
 validateMessage(type,payload);
 if(JSON.stringify(payload)!==json)throw new ProtocolError("Noncanonical or duplicate JSON");
 return {type,requestId:view.getUint32(7),payload};
}
