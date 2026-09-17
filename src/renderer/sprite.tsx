import { useEffect, useRef } from 'react';
import type { AgentStatus } from '../core/types';
import type { UserPetMeta } from '../shared/api';
import { selectAnimation, validateManifest, type Animation, type WalkDirection } from '../shared/animation';
import { resolvePet } from '../shared/pets';
import { startPlayback } from './animation/playback';
import { labels } from './task-presentation';

const sheets = import.meta.glob('../../assets/*/spritesheet.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function Sprite({ status, src, petId, animations, walkAnimation, walkDir }: {
  status: AgentStatus; src: string; petId: string;
  animations: Record<AgentStatus, Animation>; walkAnimation?: Animation;
  walkDir?: WalkDirection;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const animation = selectAnimation({ animations, walkAnimation }, status, walkDir);
  const { row, frames, durationMs } = animation;
  useEffect(() => {
    const img = new Image();
    let stop: (() => void) | undefined;
    let disposed = false;
    img.onload = () => {
      if (disposed) return;
      const clip = { row, frames, durationMs };
      validateManifest(clip, img.naturalWidth, img.naturalHeight);
      const context = canvas.current?.getContext('2d');
      if (!context) return;
      stop = startPlayback(clip, frame => {
        context.clearRect(0, 0, 192, 208);
        context.drawImage(img, frame * 192, (row - 1) * 208, 192, 208, 0, 0, 192, 208);
      });
    };
    img.src = src;
    return () => { disposed = true; img.onload = null; stop?.(); };
  }, [status, petId, walkDir, src, row, frames, durationMs]);
  return <canvas width={192} height={208} ref={canvas} aria-label={`桌寵：${labels[status]}`} />;
}

export function ResolvedSprite({status,petId,userPets,walkDir}:{status:AgentStatus;petId?:string;userPets:UserPetMeta[];walkDir?:'left'|'right'|null}) {
  const userPet=userPets.find(p=>p.id===petId);
  if(userPet) return <Sprite status={status} petId={userPet.id}
    src={`pet-asset:///spritesheet?id=${encodeURIComponent(userPet.id)}`}
    animations={userPet.animations} walkAnimation={userPet.walkAnimation} walkDir={walkDir}/>;
  const builtin=resolvePet(petId);
  return <Sprite status={status} petId={builtin.id} src={sheets[builtin.assetKey]}
    animations={builtin.animations} walkAnimation={builtin.walkAnimation} walkDir={walkDir}/>;
}

