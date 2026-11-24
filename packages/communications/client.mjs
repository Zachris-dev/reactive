// Browser/Node-compatible transport using the same protocol registry as Worker.
// Session auth is deliberately external; this helper never creates or stores
// credentials. HTTPS is mandatory except for loopback local development.
import {encodeMessage,decodeMessage,ProtocolError} from "./protocol.mjs";

export async function sendMessage({
 url,type,payload,requestId,headers={},fetchImpl=fetch
}) {
 const target=new URL(url);
 if(target.protocol!=="https:" && !(target.protocol==="http:" &&
    (target.hostname==="127.0.0.1"||target.hostname==="localhost")))
  throw new ProtocolError("HTTPS required outside loopback development");
 const outgoing=encodeMessage(type,payload,requestId);
 const requestHeaders=new Headers(headers);
 requestHeaders.set("content-type","application/octet-stream");
 const response=await fetchImpl(target.toString(),{
  method:"POST",headers:requestHeaders,body:outgoing,
  credentials:"same-origin",redirect:"error",cache:"no-store"
 });
 if(response.headers.get("content-type")?.split(";")[0]!=="application/octet-stream"){
  throw new ProtocolError("Server did not return a protocol frame (HTTP "+response.status+")");
 }
 const received=decodeMessage(new Uint8Array(await response.arrayBuffer()),"response");
 if(received.requestId!==requestId)throw new ProtocolError("Response request ID mismatch");
 if(received.payload.status!==response.status)throw new ProtocolError("Response HTTP status mismatch");
 return received.payload;
}
