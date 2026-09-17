import { useEffect, useRef, useState } from 'react';
import type { AppSnapshot } from '../shared/api';
import { ResolvedSprite } from './sprite';
import { labels, providerLabel, selectPetStatus } from './task-presentation';
import { activatePet } from './pet-actions';

export function Pet({state}:{state:AppSnapshot}) {
  const drag=useRef({active:false,moved:false,x:0,y:0,lastScreenX:0});
  const [dragDir,setDragDir]=useState<'left'|'right'|null>(null);
  const active=state.notification;
  const waiting=state.tasks.filter(t=>t.status==='waiting').length;
  const status=selectPetStatus(state.tasks,active);
  useEffect(()=>{
    const move=(event:MouseEvent)=>{
      if(drag.current.active)return;
      const target=event.target as HTMLElement;
      let interactive=!!target.closest('[data-interactive]');
      if(target instanceof HTMLCanvasElement){
        const rect=target.getBoundingClientRect();
        const x=Math.floor((event.clientX-rect.left)*192/rect.width),y=Math.floor((event.clientY-rect.top)*208/rect.height);
        interactive=x>=0&&x<192&&y>=0&&y<208&&(target.getContext('2d')?.getImageData(x,y,1,1).data[3]||0)>16;
      }
      window.pet.interactive(interactive);
    };
    const leave=()=>{if(!drag.current.active)window.pet.interactive(false);};
    window.addEventListener('mousemove',move);document.addEventListener('mouseleave',leave);
    return ()=>{window.removeEventListener('mousemove',move);document.removeEventListener('mouseleave',leave);};
  },[]);
  return <div className={`pet-stage ${state.bubbleSide}`}>
    {active&&<section className={`bubble ${active.kind}`} data-interactive
      onClick={async()=>{const {ok}=await window.pet.focusApp(active.provider);if(!ok)window.pet.openPanel();}}>
      <div className="bubble-heading"><span className="dot"/>{labels[active.kind]}<button aria-label="收起氣泡" className="close" onClick={e=>{e.stopPropagation();window.pet.dismiss();}}>×</button></div>
      <p>{active.summary}</p>
      <button className="bubble-source">{providerLabel[active.provider]} · {active.taskName||active.sessionId.slice(0,12)} <span>↗</span></button>
    </section>}
    <div className="pet-character" onPointerDown={event=>{
      if(event.button!==0)return;
      drag.current={active:true,moved:false,x:event.screenX,y:event.screenY,lastScreenX:event.screenX};
      event.currentTarget.setPointerCapture(event.pointerId);window.pet.interactive(true);window.pet.drag('start');
    }} onPointerMove={event=>{
      if(!drag.current.active)return;
      const dx=event.screenX-drag.current.lastScreenX;
      drag.current.lastScreenX=event.screenX;
      if(Math.abs(event.screenX-drag.current.x)+Math.abs(event.screenY-drag.current.y)>4)drag.current.moved=true;
      if(drag.current.moved){window.pet.drag('move');if(Math.abs(dx)>1)setDragDir(dx<0?'left':'right');}
    }} onPointerUp={async event=>{
      if(!drag.current.active)return;
      window.pet.drag('end');drag.current.active=false;setDragDir(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      if(!drag.current.moved)await activatePet(state.preferences.petClick,window.pet);
    }} onPointerCancel={()=>{drag.current.active=false;setDragDir(null);window.pet.drag('end');}}>
      <ResolvedSprite status={status} petId={state.preferences.petId} userPets={state.userPets} walkDir={dragDir}/>
    </div>
    {waiting>0&&<button data-interactive className="waiting-badge" onClick={()=>window.pet.openPanel()} aria-label={`${waiting} 個任務等待確認`}>{waiting} 待確認</button>}
  </div>;
}
