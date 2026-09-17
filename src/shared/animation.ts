import type { AgentStatus } from '../core/types';
export type Animation = { row: number; frames: number; durationMs: number };
export function frameAt(a: Animation, elapsed: number): number {
  return Math.floor((Math.max(0,elapsed) % a.durationMs) * a.frames / a.durationMs + 1e-9) % a.frames;
}
export function validateManifest(a: Animation, width: number, height: number): void {
  if (!Number.isInteger(a.row) || !Number.isInteger(a.frames) || a.row < 1 || a.frames < 1 ||
      a.frames * 192 > width || a.row * 208 > height || !Number.isFinite(a.durationMs) || a.durationMs <= 0) {
    throw new Error('Animation exceeds spritesheet bounds');
  }
}

export type WalkDirection = 'left' | 'right' | null;

// Selection policy does not depend on React, image loading or the playback clock.
export function selectAnimation(
  pet: { animations: Record<AgentStatus, Animation>; walkAnimation?: Animation },
  status: AgentStatus,
  direction?: WalkDirection,
): Animation {
  if (direction === 'right') return pet.animations.tool;
  if (direction === 'left') return pet.walkAnimation || pet.animations.tool;
  return pet.animations[status];
}
