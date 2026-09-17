import defaultPet from '../../assets/deepseek/pet.json';
export type Animation = { row: number; frames: number; durationMs: number };
export const animations = defaultPet.animations satisfies Record<string,Animation>;
export function frameAt(a: Animation, elapsed: number): number {
  return Math.floor((Math.max(0,elapsed) % a.durationMs) * a.frames / a.durationMs + 1e-9) % a.frames;
}
export function validateManifest(a: Animation, width: number, height: number): void {
  if (!Number.isInteger(a.row) || !Number.isInteger(a.frames) || a.row < 1 || a.frames < 1 ||
      a.frames * 192 > width || a.row * 208 > height || !Number.isFinite(a.durationMs) || a.durationMs <= 0) {
    throw new Error('Animation exceeds spritesheet bounds');
  }
}
export function fitPet(p: {x:number;y:number}, area: {x:number;y:number;width:number;height:number}) {
  const width=Math.min(320,area.width), height=Math.min(360,area.height);
  const x=Math.round(p.x-(width-192)/2); // no horizontal clamping — free cross-screen movement
  const petY=Math.round(Math.max(area.y,Math.min(p.y,area.y+area.height-208)));
  const y=Math.round(Math.max(area.y,Math.min(petY-(height-208),area.y+area.height-height)));
  return {x,y,width,height,side:'right' as const,petX:Math.round(x+(width-192)/2),petY:y+(height-208)};
}
