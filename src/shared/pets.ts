import type { AgentStatus } from '../core/types';
import { validateManifest, type Animation } from './animation';

export interface PetDefinition {
  schemaVersion: 1; id: string; displayName: string; description: string;
  spritesheetPath: string; frameWidth: 192; frameHeight: 208;
  animations: Record<AgentStatus, Animation>;
  walkAnimation?: Animation;
}

// Standard spritesheet layout shared by all v2 Codex pets.
const SPRITE_V2_ANIMATIONS: Record<AgentStatus, Animation> = {
  idle:        {row:1, frames:6, durationMs:4290},
  working:     {row:8, frames:6, durationMs:1800},
  tool:        {row:2, frames:8, durationMs:1060},
  waiting:     {row:4, frames:4, durationMs:1600},
  ended:       {row:7, frames:6, durationMs:1800},
  interrupted: {row:6, frames:8, durationMs:2400},
  failed:      {row:6, frames:8, durationMs:2400},
  unknown:     {row:1, frames:6, durationMs:4290},
};
const SPRITE_V2_WALK: Animation = {row:3, frames:8, durationMs:1060};

const statuses: AgentStatus[] = ['idle','working','tool','waiting','ended','interrupted','failed','unknown'];
export function parsePet(value: unknown): PetDefinition {
  if (!value || typeof value !== 'object') throw Error('Invalid pet metadata');
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id || p.id.length > 128 ||
      typeof p.displayName !== 'string' || !p.displayName ||
      typeof p.description !== 'string' || p.spritesheetPath !== 'spritesheet.webp') {
    throw Error('Invalid pet metadata');
  }

  let animations: Record<AgentStatus, Animation>;
  let walkAnimation: Animation | undefined;

  if (p.schemaVersion === 1) {
    if (p.frameWidth !== 192 || p.frameHeight !== 208 || !p.animations) throw Error('Invalid pet metadata');
    animations = p.animations as Record<AgentStatus, Animation>;
    walkAnimation = p.walkAnimation as Animation | undefined;
    for (const status of statuses) {
      const a = animations[status];
      if (!a) throw Error(`Missing animation: ${status}`);
      validateManifest(a, 1536, 2288);
    }
    if (walkAnimation) validateManifest(walkAnimation, 1536, 2288);
  } else {
    animations = SPRITE_V2_ANIMATIONS;
    walkAnimation = SPRITE_V2_WALK;
  }

  return {schemaVersion:1, id:p.id, displayName:p.displayName as string,
    description:p.description as string, spritesheetPath:'spritesheet.webp',
    frameWidth:192, frameHeight:208, animations, ...(walkAnimation?{walkAnimation}:{})};
}
const manifests = import.meta.glob('../../assets/*/pet.json', {eager:true,import:'default'});
export const pets = Object.entries(manifests).map(([file,value])=>({
  ...parsePet(value), assetKey:file.replace(/pet\.json$/, 'spritesheet.webp')
})).sort((a,b)=>a.id.localeCompare(b.id));
if (new Set(pets.map(p=>p.id)).size !== pets.length) throw Error('Duplicate pet IDs');
export const defaultPetId = 'deepseek';
export function findPet(id: unknown) { return pets.find(p=>p.id===id); }
export function resolvePet(id: unknown) {
  const pet = findPet(id) || findPet(defaultPetId);
  if (!pet) throw Error('Default pet missing');
  return pet;
}
