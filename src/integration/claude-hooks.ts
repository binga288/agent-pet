import { readFile, writeFile, mkdir, rename, unlink, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const MARKER='--desktop-pet-claude-hook-v1';
const EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','PostToolUseFailure','Stop','StopFailure','SessionEnd'];
type Obj=Record<string,any>; const object=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const owned=(h:Obj)=>h.type==='command'&&typeof h.command==='string'&&h.command.endsWith(` ${MARKER}`);
async function load(path:string):Promise<{doc:Obj;raw?:string}>{
  let raw:string;try{if((await stat(path)).size>1024*1024)throw Error('Claude settings exceeds 1 MiB');raw=await readFile(path,'utf8');}catch(e:any){if(e.code==='ENOENT')return{doc:{}};throw e;}
  const doc:unknown=JSON.parse(raw);if(!object(doc)||(doc.hooks!==undefined&&!object(doc.hooks)))throw Error('Malformed Claude settings');
  for(const groups of Object.values(doc.hooks??{}))if(!Array.isArray(groups)||groups.some(g=>!object(g)||!Array.isArray(g.hooks)||g.hooks.some((h:unknown)=>!object(h))))throw Error('Malformed Claude hook entries');
  return{doc,raw};
}
function removeOwned(doc:Obj){for(const [event,groups] of Object.entries(doc.hooks??{}) as [string,Obj[]][]){doc.hooks[event]=groups.flatMap(group=>{const hooks=group.hooks.filter((h:Obj)=>!owned(h));return hooks.length===group.hooks.length?[group]:hooks.length||Object.keys(group).some(k=>k!=='hooks')?[{...group,hooks}]:[];});if(!doc.hooks[event].length)delete doc.hooks[event];}}
async function save(path:string,doc:Obj,raw?:string){const next=`${JSON.stringify(doc,null,2)}\n`;if(next===raw)return;await mkdir(dirname(path),{recursive:true});const suffix=`${Date.now()}-${randomUUID()}`;if(raw!==undefined)await writeFile(`${path}.desktop-pet-backup-${suffix}`,raw,{flag:'wx'});const tmp=`${path}.desktop-pet-${suffix}.tmp`;try{await writeFile(tmp,next,{flag:'wx'});const current=await readFile(path,'utf8').catch((e:any)=>e.code==='ENOENT'?undefined:Promise.reject(e));if(current!==raw)throw Error('Claude settings changed concurrently; retry');await rename(tmp,path);}finally{await unlink(tmp).catch(()=>{});}}
export async function installClaudeHooks(path:string,command:string,shell:'powershell'|'bash'='powershell',timeout=2){if(!command.trim()||/[\r\n]/.test(command))throw Error('Invalid Claude relay command');if(!Number.isInteger(timeout)||timeout<1||timeout>30)throw Error('Invalid Claude hook timeout');const {doc,raw}=await load(path);removeOwned(doc);doc.hooks??={};for(const event of EVENTS){doc.hooks[event]??=[];doc.hooks[event].push({...(event==='PreToolUse'||event==='PermissionRequest'||event==='PostToolUse'||event==='PostToolUseFailure'?{matcher:'*'}:{}),hooks:[{type:'command',command:`${command} ${MARKER}`,shell,timeout}]});}await save(path,doc,raw);}
export async function uninstallClaudeHooks(path:string){const {doc,raw}=await load(path);if(raw===undefined)return;const before=JSON.stringify(doc);removeOwned(doc);if(JSON.stringify(doc)!==before)await save(path,doc,raw);}
export async function claudeHooksInstalled(path:string){const {doc}=await load(path);return EVENTS.every(event=>doc.hooks?.[event]?.some((g:Obj)=>g.hooks.some(owned)));}
