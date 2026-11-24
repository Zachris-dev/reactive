import test from "node:test";
import assert from "node:assert/strict";
import {handleRequest} from "../../apps/character_server/src/worker.mjs";

const local=(path,headers={})=>new Request("http://127.0.0.1:8787"+path,{headers});
test("health endpoint identifies disabled/development modes",async()=>{
 const dev=await (await handleRequest(local("/health"),{DEV_AUTH:"local-only"})).json();
 const disabled=await (await handleRequest(new Request("https://example.com/health"),{DEV_AUTH:"local-only"})).json();
 assert.equal(dev.mode,"development");
 assert.equal(disabled.mode,"disabled");
});
test("remote API never accepts a developer identity, even if flag is accidentally deployed",async()=>{
 const req=new Request("https://example.com/api/me",{headers:{"x-dev-user":"test_admin"}});
 const response=await handleRequest(req,{DEV_AUTH:"local-only",DB:{prepare(){throw Error("Should never access DB");}}});
 assert.equal(response.status,503);
});
test("without local-only setting development API cannot be used",async()=>{
 const response=await handleRequest(local("/api/me",{"x-dev-user":"test_admin"}),{DEV_AUTH:"no"});
 assert.equal(response.status,503);
});
test("unrecognized API endpoints fail without disclosing internal errors",async()=>{
 const response=await handleRequest(local("/api/whatever"),{DEV_AUTH:"local-only"});
 assert.equal(response.status,503); // No D1 configured, fail closed.
});
test("developer console served without login; API is protected separately",async()=>{
 const response=await handleRequest(local("/"),{DEV_AUTH:"local-only"});
 assert.equal(response.status,200);
 assert.match(await response.text(),/Reactive Character Server/);
});

test("offline workspace shell and service worker are served without identity",async()=>{
 const app=await handleRequest(local("/offline"),{DEV_AUTH:"local-only"});
 assert.equal(app.status,200);
 assert.match(await app.text(),/Reactive — Offline Workspace/);
 const sw=await handleRequest(local("/offline-sw.js"),{DEV_AUTH:"local-only"});
 assert.equal(sw.status,200);
 assert.match(sw.headers.get("content-type"),/text\/javascript/);
 assert.match(await sw.text(),/caches\.open/);
});
