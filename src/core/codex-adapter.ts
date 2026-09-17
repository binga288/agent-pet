import type { AgentEvent, AgentStatus } from './types';

const hooks: Record<string, [AgentStatus, string]> = {
  SessionStart: ['idle', '工作階段已開始'],
  UserPromptSubmit: ['working', '正在處理你的要求'],
  PreToolUse: ['tool', '正在執行工具'],
  PermissionRequest: ['waiting', '需要你的確認才能繼續'],
  PostToolUse: ['working', '工具操作已返回，agent 繼續工作'],
  Stop: ['ended', '這一回合已結束'],
  Interrupt: ['interrupted', '目前回合已中斷'],
  SessionEnd: ['unknown', '工作階段已結束'],
  PreCompact: ['working', '正在整理上下文'],
  PostCompact: ['working', '上下文整理完成，繼續工作'],
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function clean(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, limit) || undefined;
}

/** Accept only the relay envelope; raw tool/prompt/transcript data never leaves here. */
export function normalizeHook(input: unknown, receivedAt?: number): AgentEvent {
  const envelope = record(input);
  if (envelope.provider !== undefined && envelope.provider !== 'codex') throw new Error('Invalid Codex provider');
  const hook = record(envelope.hook);
  const id = clean(envelope.id, 128);
  const origin = clean(envelope.origin, 84);
  const sessionId = clean(hook.session_id, 256);
  const name = typeof hook.hook_event_name === 'string' ? hook.hook_event_name : '';
  const mapping = Object.hasOwn(hooks, name) ? hooks[name] : undefined;
  if (!id || !sessionId || !mapping) throw new Error('Invalid Codex hook identity or event name');
  const time = receivedAt ?? envelope.receivedAt ?? Date.now();
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) throw new Error('Invalid receipt timestamp');
  const [kind, summary] = mapping;
  return {
    version: 1, id, provider: 'codex', ...(origin && /^wsl:[A-Za-z0-9._-]{1,80}$/.test(origin) ? {origin} : {}), sessionId, kind, receivedAt: time,
    ...(name === 'UserPromptSubmit' ? { startsTurn: true } : {}),
    summary: name === 'Stop' ? clean(hook.last_assistant_message, 180) ?? summary : summary,
    ...(clean(hook.turn_id, 256) ? { turnId: clean(hook.turn_id, 256) } : {}),
    ...(clean(hook.task_name, 120) ? { taskName: clean(hook.task_name, 120) } : {}),
    ...(clean(hook.tool_use_id, 256) ? { toolId: clean(hook.tool_use_id, 256) } : {}),
  };
}
