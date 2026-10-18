// Browser-independent character library using IndexedDB.
// Storage is per browser profile and origin; JSON import/export remains portable.
const DATABASE="reactive-characters",STORE="characters";
export function openCharacterLibrary(indexedDB=globalThis.indexedDB){
 if(!indexedDB)return Promise.reject(Error("IndexedDB is unavailable in this browser"));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("Cannot open character library"));
 });
}
async function operation(mode,callback,indexedDB){
 const db=await openCharacterLibrary(indexedDB);
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
  let value;
  tx.oncomplete=()=>{db.close();resolve(value);};
  tx.onerror=()=>{db.close();reject(tx.error||Error("Character library transaction failed"));};
  tx.onabort=()=>{db.close();reject(tx.error||Error("Character library transaction aborted"));};
  try{callback(store,result=>{value=result;});}catch(error){tx.abort();reject(error);}
 });
}
export const newCharacterId=()=>globalThis.crypto?.randomUUID?.()||"character-"+Date.now()+"-"+Math.random().toString(36).slice(2);
export function preparedCharacter(document,{id=newCharacterId(),now=new Date().toISOString()}={}){
 const data=structuredClone(document);
 const previous=data.library||{};
 data.library={...previous,id,revision:previous.id===id?(previous.revision||0)+1:1,modified:now};
 return data;
}
export function saveCharacter(document,indexedDB){
 if(!document?.library?.id)return Promise.reject(Error("Character must have a library ID"));
 return operation("readwrite",(store,done)=>{store.put({id:document.library.id,document});done(document);},indexedDB);
}
export function listCharacters(indexedDB){
 return operation("readonly",(store,done)=>{
  const request=store.getAll();
  request.onsuccess=()=>done(request.result.map(row=>({
   id:row.id,name:row.document.primary?.name||"Unnamed character",
   campaign:row.document.format?.match(/^Character sheet - Reactive \S+ - (.+) - Created /)?.[1]||"",
   revision:row.document.library?.revision||1,modified:row.document.library?.modified||""
  })).sort((a,b)=>b.modified.localeCompare(a.modified)));
 },indexedDB);
}
export function loadCharacter(id,indexedDB){
 return operation("readonly",(store,done)=>{
  const request=store.get(id);request.onsuccess=()=>done(request.result?.document||null);
 },indexedDB);
}
export function deleteCharacter(id,indexedDB){
 return operation("readwrite",(store,done)=>{store.delete(id);done(true);},indexedDB);
}
