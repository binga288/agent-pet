import { defaultPetId } from '../shared/pets';
import { mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentEvent } from '../core/types';
import type { AgentAppConfig, PetClickConfig, Preferences } from '../shared/api';
const validAppTypes = ['none','claude-desktop','wt','cmd','process'] as const;
const validPetClickTypes = ['open-panel','focus-claude','focus-codex','wt','cmd','process'] as const;
function parsePetClick(v: unknown): PetClickConfig {
  if (!v || typeof v !== 'object') return { type: 'open-panel' };
  const obj = v as Record<string,unknown>;
  const type = validPetClickTypes.includes(obj.type as PetClickConfig['type']) ? obj.type as PetClickConfig['type'] : 'open-panel';
  const processName = type === 'process' && typeof obj.processName === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(obj.processName) ? obj.processName : undefined;
  return { type, ...(processName ? { processName } : {}) };
}
function parseAgentApp(v: unknown): AgentAppConfig {
  if (!v || typeof v !== 'object') return { type: 'none' };
  const obj = v as Record<string,unknown>;
  const type = validAppTypes.includes(obj.type as AgentAppConfig['type']) ? obj.type as AgentAppConfig['type'] : 'none';
  const processName = type === 'process' && typeof obj.processName === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(obj.processName) ? obj.processName : undefined;
  return { type, ...(processName ? { processName } : {}) };
}
export const defaults: Preferences = { petId: defaultPetId, paused: false, hidden: false, launchAtLogin: false, agentApp: { claude: { type: 'claude-desktop' }, codex: { type: 'none' } }, petClick: { type: 'open-panel' } };
export function readSaved(dir: string): { preferences: Preferences; history: AgentEvent[] } {
  try {
    const file=path.join(dir,'state.json');
    if(statSync(file).size>1024*1024)throw Error('Saved state too large');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const p = data.preferences || {};
    return { preferences: {
      petId: (typeof p.petId === 'string' && p.petId.length >= 1 && p.petId.length <= 128) ? p.petId : defaultPetId, paused: p.paused === true, hidden: p.hidden === true, launchAtLogin: p.launchAtLogin === true,
      ...(typeof p.wslDistro==='string'&&/^[A-Za-z0-9._-]{1,80}$/.test(p.wslDistro)?{wslDistro:p.wslDistro}:{}),
      ...(Number.isFinite(p.position?.x) && Number.isFinite(p.position?.y) ? {position:{x:p.position.x,y:p.position.y}} : {}),
      agentApp: { claude: parseAgentApp(p.agentApp?.claude), codex: parseAgentApp(p.agentApp?.codex) },
      petClick: parsePetClick(p.petClick)
    }, history: Array.isArray(data.history) ? data.history.slice(-100).filter((e: AgentEvent) =>
      e?.version === 1 && ['codex','claude'].includes(e.provider) && (e.origin===undefined || typeof e.origin==='string') && typeof e.sessionId === 'string' &&
      typeof e.id === 'string' && typeof e.summary === 'string' && Number.isFinite(e.receivedAt) &&
      ['unknown','idle','working','tool','waiting','ended','interrupted','failed'].includes(e.kind)
    ).map((e: AgentEvent) => ({version:1,id:e.id.slice(0,128),provider:e.provider,...(typeof e.origin==='string'&&/^wsl:[A-Za-z0-9._-]{1,80}$/.test(e.origin)?{origin:e.origin}:{}),sessionId:e.sessionId.slice(0,256),turnId:typeof e.turnId==='string'?e.turnId.slice(0,256):undefined,
      kind:e.kind,receivedAt:e.receivedAt,summary:e.summary.slice(0,180),startsTurn:e.startsTurn===true})) : [] };
  } catch { return { preferences: { ...defaults }, history: [] }; }
}
export function saveState(dir: string, preferences: Preferences, history: AgentEvent[]) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'state.json');
  writeFileSync(file + '.tmp', JSON.stringify({preferences,history:history.slice(-100)}, null, 2), 'utf8');
  renameSync(file + '.tmp', file);
}
