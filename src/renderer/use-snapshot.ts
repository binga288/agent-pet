import { useEffect, useState } from 'react';
import type { AppSnapshot } from '../shared/api';

export function useSnapshot() {
  const [state,setState]=useState<AppSnapshot>();
  useEffect(()=>{
    let live=true;
    const unsubscribe=window.pet.subscribe(s=>{if(live)setState(s);});
    window.pet.snapshot().then(s=>{if(live)setState(s);});
    return ()=>{live=false;unsubscribe();};
  },[]);
  return state;
}

