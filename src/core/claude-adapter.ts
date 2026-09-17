import type { AgentEvent, AgentStatus } from './types';

const hooks: Record<string, [AgentStatus, string]> = {
  SessionStart:['idle','Claude Code 工作階段已開始'], UserPromptSubmit:['working','Claude 正在處理你的要求'],
  PreToolUse:['tool','Claude 正在執行工具'], PermissionRequest:['waiting','Claude 需要你的確認'],
  Notification:['waiting','Claude 正在等待你的回應'], PostToolUse:['working','工具操作已返回，Claude 繼續工作'],
  PostToolUseFailure:['working','工具未完成，Claude 仍可繼續工作'], Stop:['ended','Claude 這一回合已結束'],
  StopFailure:['failed','Claude 回合失敗'], SessionEnd:['unknown','Claude 工作階段已結束']
};
const clean=(value:unknown,limit:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,limit)||undefined:undefined;
export function normalizeClaudeHook(input:unknown):AgentEvent {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected envelope');
  const envelope=input as Record<string,unknown>;
  if(envelope.provider!=='claude'||!envelope.hook||typeof envelope.hook!=='object'||Array.isArray(envelope.hook))throw Error('Invalid Claude envelope');
  const hook=envelope.hook as Record<string,unknown>;const id=clean(envelope.id,128),sessionId=clean(hook.session_id,256),name=clean(hook.hook_event_name,80),origin=clean(envelope.origin,84);
  const mapping=name&&hooks[name];const receivedAt=envelope.receivedAt;
  if(!id||!sessionId||!mapping||typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('Invalid Claude hook identity');
  const [kind,summary]=mapping;
  return {version:1,id,provider:'claude',...(origin&&/^wsl:[A-Za-z0-9._-]{1,80}$/.test(origin)?{origin}:{}),sessionId,kind,receivedAt,summary:name==='Stop'?clean(hook.last_assistant_message,180)??summary:summary,...(name==='UserPromptSubmit'?{startsTurn:true}:{}),...(clean(hook.tool_use_id,256)?{toolId:clean(hook.tool_use_id,256)}:{})};
}
