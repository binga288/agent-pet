import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentAppConfig, AppSnapshot, PetClickConfig, Preferences, UserPetMeta } from '../shared/api';
import type { AgentStatus } from '../core/types';
import { frameAt, validateManifest, type Animation } from '../shared/animation';
import { pets, resolvePet } from '../shared/pets';
const sheets = import.meta.glob('../../assets/*/spritesheet.webp', { eager:true, query:'?url', import:'default' }) as Record<string,string>;
import './style.css';

const labels: Record<AgentStatus,string>={unknown:'尚未確認',idle:'閒置',working:'工作中',tool:'執行工具',waiting:'等待確認',ended:'回合結束',interrupted:'已中斷',failed:'失敗'};
const providerLabel={codex:'Codex',claude:'Claude Code'} as const;
document.title=new URLSearchParams(location.search).get('view')==='pet'?'Agent Pet':'Agent Pet · 任務中心';
const rank:Record<AgentStatus,number>={waiting:5,failed:4,ended:3,interrupted:2,tool:1,working:1,idle:0,unknown:0};
function useSnapshot() {
  const [state,setState]=useState<AppSnapshot>();
  useEffect(()=>{
    let live=true;
    const unsubscribe=window.pet.subscribe(s=>{if(live)setState(s);});
    window.pet.snapshot().then(s=>{if(live)setState(s);});
    return ()=>{live=false;unsubscribe();};
  },[]);
  return state;
}

// Sprite renders from pre-resolved data; a change in src/petId/status starts a new timeline.
function Sprite({status,src,petId,animations,walkAnimation,walkDir}:{
  status:AgentStatus;src:string;petId:string;
  animations:Record<AgentStatus,Animation>;walkAnimation?:Animation;
  walkDir?:'left'|'right'|null;
}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const isWalking=!!walkDir;
  useEffect(()=>{
    const img=new Image();let timer:number|undefined;let disposed=false;
    img.src=src;
    img.onload=()=>{
      if(disposed)return;
      const animation=isWalking
        ?(walkDir==='right'?animations.tool:(walkAnimation||animations.tool))
        :animations[status];
      validateManifest(animation,img.naturalWidth,img.naturalHeight);
      const context=canvas.current?.getContext('2d');if(!context)return;
      const start=performance.now();let previous=-1;
      const draw=()=>{
        const frame=frameAt(animation,performance.now()-start);
        if(frame!==previous){
          context.clearRect(0,0,192,208);
          context.drawImage(img,frame*192,(animation.row-1)*208,192,208,0,0,192,208);previous=frame;
        }
      };
      draw();timer=window.setInterval(draw,40);
    };
    return ()=>{disposed=true;window.clearInterval(timer);};
  },[status,petId,isWalking,walkDir,src]);
  return <canvas width={192} height={208} ref={canvas}
    aria-label={`桌寵：${labels[status]}`}/>;
}
function ResolvedSprite({status,petId,userPets,walkDir}:{status:AgentStatus;petId?:string;userPets:UserPetMeta[];walkDir?:'left'|'right'|null}) {
  const userPet=userPets.find(p=>p.id===petId);
  if(userPet) return <Sprite status={status} petId={userPet.id}
    src={`pet-asset:///spritesheet?id=${encodeURIComponent(userPet.id)}`}
    animations={userPet.animations} walkAnimation={userPet.walkAnimation} walkDir={walkDir}/>;
  const builtin=resolvePet(petId);
  return <Sprite status={status} petId={builtin.id} src={sheets[builtin.assetKey]}
    animations={builtin.animations} walkAnimation={builtin.walkAnimation} walkDir={walkDir}/>;
}

function Pet({state}:{state:AppSnapshot}) {
  const drag=useRef({active:false,moved:false,x:0,y:0,lastScreenX:0});
  const [dragDir,setDragDir]=useState<'left'|'right'|null>(null);
  const tasks=[...state.tasks].sort((a,b)=>rank[b.status]-rank[a.status]||b.updatedAt-a.updatedAt);
  const active=state.notification;
  const waiting=state.tasks.filter(t=>t.status==='waiting').length;
  const ongoing=tasks.find(t=>['waiting','failed','working','tool'].includes(t.status));
  const status=active?.kind||ongoing?.status||'idle';
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
      if(!drag.current.moved){
        const cfg=state.preferences.petClick??{type:'open-panel' as const};
        if(cfg.type==='focus-claude'){const {ok}=await window.pet.focusApp('claude');if(!ok)window.pet.openPanel();}
        else if(cfg.type==='focus-codex'){const {ok}=await window.pet.focusApp('codex');if(!ok)window.pet.openPanel();}
        else if(cfg.type==='wt'){const {ok}=await window.pet.focusProcess('WindowsTerminal');if(!ok)window.pet.openPanel();}
        else if(cfg.type==='cmd'){const {ok}=await window.pet.focusProcess('cmd');if(!ok)window.pet.openPanel();}
        else if(cfg.type==='process'&&cfg.processName){const {ok}=await window.pet.focusProcess(cfg.processName);if(!ok)window.pet.openPanel();}
        else window.pet.openPanel();
      }
    }} onPointerCancel={()=>{drag.current.active=false;setDragDir(null);window.pet.drag('end');}}>
      <ResolvedSprite status={status} petId={state.preferences.petId} userPets={state.userPets} walkDir={dragDir}/>
    </div>
    {waiting>0&&<button data-interactive className="waiting-badge" onClick={()=>window.pet.openPanel()} aria-label={`${waiting} 個任務等待確認`}>{waiting} 待確認</button>}
  </div>;
}

function Panel({state}:{state:AppSnapshot}) {
  const [tab,setTab]=useState<'tasks'|'history'|'settings'|'pets'>('tasks');
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const [refreshing,setRefreshing]=useState(false);const [refreshMsg,setRefreshMsg]=useState('');
  const tasks=[...state.tasks].sort((a,b)=>rank[b.status]-rank[a.status]||b.updatedAt-a.updatedAt);
  const count=state.tasks.filter(t=>['working','tool'].includes(t.status)).length;
  const waiting=state.tasks.filter(t=>t.status==='waiting').length;
  const preference=async(p:Parameters<typeof window.pet.preferences>[0])=>{
    try{await window.pet.preferences(p);setMessage('設定已更新');}catch(e){setMessage(String(e));}
  };
  const copy=async(text:string)=>{await window.pet.copy(text);setMessage('已複製');};
  const refreshPets=async()=>{
    setRefreshing(true);setRefreshMsg('');
    try{const r=await window.pet.refreshUserPets();setRefreshMsg(`找到 ${r.count} 個使用者角色${r.errors.length?`，${r.errors.length} 個錯誤`:''}`);}
    catch(e){setRefreshMsg(String(e));}
    setRefreshing(false);
  };
  const integration=async(action:'install'|'uninstall'|'installClaude'|'uninstallClaude'|'installWslCodex'|'uninstallWslCodex'|'installWslClaude'|'uninstallWslClaude')=>{
    setBusy(true);try{const result=await window.pet.integration(action);setMessage(result.message);}catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  return <div className="app-shell">
    <aside><div className="brand"><span className="brand-mark">••</span><div>Agent Pet<small>你的工作夥伴</small></div></div>
      <div className="nav-label">工作空間</div>
      <nav><button className={tab==='tasks'?'selected':''} onClick={()=>setTab('tasks')}><span>◉</span> 任務總覽 <b>{tasks.length}</b></button>
      <button className={tab==='history'?'selected':''} onClick={()=>setTab('history')}><span>◷</span> 最近活動</button>
      <button className={tab==='pets'?'selected':''} onClick={()=>setTab('pets')}><span>♧</span> Pets · 桌寵</button>
      <button className={tab==='settings'?'selected':''} onClick={()=>setTab('settings')}><span>⚙</span> 偏好與連線</button></nav>
      <div className="sidebar-bottom"><span className={`dot ${state.integration.receiving?'connected':''}`}/>{state.integration.receiving?'已收到 Codex 事件':'等待 Codex 事件'}<small>僅在本機接收 · 無模型呼叫</small></div>
    </aside>
    <main>
      <header><div className="eyebrow">YOUR QUIET COMPANION</div><div className="page-heading"><h1>{tab==='pets'?'選一位工作夥伴。':tab==='tasks'?'掌握進度，保持專注。':tab==='history'?'每一步，都有跡可循。':'讓桌寵配合你的節奏。'}</h1><button className="subtle" onClick={()=>preference({paused:!state.preferences.paused})}>{state.preferences.paused?'恢復提醒':'暫停提醒'}</button></div><p className="muted">{tab==='pets'?'預覽動畫套組，選擇後立即套用並記住設定。':tab==='tasks'?'重要的事，交給桌寵輕輕提醒。':tab==='history'?'保留最近 100 筆簡短活動，不儲存完整對話。':'控制顯示方式，並連接你的 AI agent。'}</p></header>
      {message&&<div className="message" role="status">{message}<button onClick={()=>setMessage('')} aria-label="關閉訊息">×</button></div>}
      {tab==='tasks'&&<>
        <section className="stats"><div><span className="stat-icon">↗</span><strong>{count}</strong><span>正在工作</span></div><div><span className="stat-icon amber">◌</span><strong>{waiting}</strong><span>等待你處理</span></div><div><span className="stat-icon">◉</span><strong>{state.integration.receiving?'已觀察':'待連線'}</strong><span>Codex 活動來源</span></div></section>
        <div className="section-heading"><h2>目前任務</h2><span className="muted">{tasks.length} 個工作階段</span></div>
        {tasks.length===0?<section className="empty"><div className="empty-pet"><ResolvedSprite status="idle" petId={state.preferences.petId} userPets={state.userPets}/></div><h2>準備好，陪你一起工作。</h2><p>連接 Codex 或 Claude Code 後，任務動態會出現在這裡。<br/>等待確認或回合結束時，桌寵會提醒你。</p><button className="primary" onClick={()=>setTab('settings')}>設定 Agent 連線 <span>→</span></button></section>:<div className="task-list">{tasks.map(task=><article className="task" key={task.key}><div className="task-top"><span className="provider">{task.provider==='claude'?'A':'C'}</span><strong>{task.taskName||`${providerLabel[task.provider]}${task.origin?` · ${task.origin}`:''} · ${task.sessionId.slice(0,12)}`}</strong><span className={`status ${task.status}`}><i/>{labels[task.status]}</span></div><p>{task.summary}</p><div className="task-bottom"><span>{new Date(task.updatedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</span><button onClick={()=>copy(task.sessionId)}>複製 ID</button><button onClick={()=>copy(task.summary)}>複製摘要</button></div></article>)}</div>}
      </>}
      {tab==='pets'&&<>
        <div className="section-heading"><h2>內建角色</h2><div style={{display:'flex',gap:'8px'}}><button className="subtle" onClick={()=>window.pet.openUserPetsDir()}>角色資料夾</button><button className="subtle" disabled={refreshing} onClick={refreshPets} aria-label="重新整理" title="重新整理 ~/pets">{refreshing?'…':'↺'}</button></div></div>
        {refreshMsg&&<div className="message" role="status">{refreshMsg}<button onClick={()=>setRefreshMsg('')} aria-label="關閉">×</button></div>}
        <p className="muted">將角色資料夾放入 <code>~/pets</code> 目錄（每個資料夾需含 <code>pet.json</code> 與 <code>spritesheet.webp</code>），點擊重新整理後即可選用。</p>
        <section className="pet-gallery" aria-label="桌寵套組">
          {([...pets, ...state.userPets] as Array<{id:string;displayName:string;description:string;animations:{idle:{frames:number;durationMs:number}}}> ).map(pet=><article className={`pet-card ${state.preferences.petId===pet.id?'chosen':''}`} key={pet.id}>
            <div className="pet-preview"><ResolvedSprite status="idle" petId={pet.id} userPets={state.userPets}/></div>
            <h2>{pet.displayName}</h2><p>{pet.description}</p>
            <small>{pet.animations.idle.frames} 格 idle · {(pet.animations.idle.durationMs/1000).toFixed(2)} 秒 / 輪{state.userPets.some(u=>u.id===pet.id)?<span className="tag" style={{marginLeft:'6px'}}>使用者</span>:null}</small>
            <button className={state.preferences.petId===pet.id?'subtle':'primary'} disabled={state.preferences.petId===pet.id} onClick={()=>preference({petId:pet.id})}>{state.preferences.petId===pet.id?'使用中':`選擇 ${pet.displayName}`}</button>
          </article>)}
        </section>
      </>}
      {tab==='history'&&<section className="history">{state.history.length===0?<p className="muted">尚無活動紀錄。連線後的新事件將顯示在這裡。</p>:[...state.history].reverse().map(event=><article key={event.id}><span className={`status ${event.kind}`}>{labels[event.kind]}</span><div><p>{event.summary}</p><small>{event.sessionId.slice(0,16)} · {new Date(event.receivedAt).toLocaleString('zh-TW')}</small></div></article>)}</section>}
      {tab==='settings'&&<>
        <section className="settings-card"><div className="section-heading"><h2>Codex 連線</h2><span className="tag">本機 Hooks</span></div>
        <p>{state.integration.installed?'已寫入 hook 設定；收到事件後才確認連線。':'安裝事件轉送 hooks，接收新回合的工作狀態。'}</p>
        <p className="muted">安裝會備份並合併設定，保留你原有的 hooks。接著在 Codex 的 <code>/hooks</code> 檢查並信任新增項目；若桌面版未提供入口，可在 Codex CLI 完成後重新開啟工作階段。</p>
        <button className="primary" disabled={busy} onClick={()=>integration('install')}>{busy?'處理中…':state.integration.installed?'更新連線設定':'連接 Codex'}</button>{state.integration.installed&&<button className="subtle" disabled={busy} onClick={()=>integration('uninstall')}>解除整合</button>}
        {state.integration.error&&<p className="error">{state.integration.error}</p>}
        <div className="connection-details"><span>最近事件</span><strong>{state.integration.lastEventAt?new Date(state.integration.lastEventAt).toLocaleString('zh-TW'):'尚未收到'}</strong><span>已觀察事件</span><strong>{state.integration.observed.join(' · ')||'等待真實工作回合；安裝不代表已驗證'}</strong></div></section>
        <section className="settings-card"><div className="section-heading"><h2>Claude Code 連線</h2><span className="tag">本機 Hooks</span></div><p>{state.integration.claudeInstalled?'已寫入 Claude Code hooks；收到事件後才確認連線。':'安裝 Claude Code 事件轉送 hooks，接收本機工作回合狀態。'}</p><p className="muted">安裝會備份並合併 <code>~/.claude/settings.json</code>，保留既有 hooks；Claude Code 需要重新開啟後才會載入新設定。</p><button className="primary" disabled={busy} onClick={()=>integration('installClaude')}>{busy?'處理中…':state.integration.claudeInstalled?'更新 Claude Code 連線':'連接 Claude Code'}</button>{state.integration.claudeInstalled&&<button className="subtle" disabled={busy} onClick={()=>integration('uninstallClaude')}>解除 Claude Code 整合</button>}</section>
        <section className="settings-card"><div className="section-heading"><h2>WSL 連線</h2><span className="tag">Windows relay</span></div>{state.integration.wsl.distros.length===0?<p className="muted">找不到可用的 WSL 發行版。</p>:<><p className="muted">Hook 在 WSL 中執行固定 Windows relay，桌寵仍只接收 Windows loopback 事件。</p><label className="setting"><div><strong>發行版</strong><small>Codex 與 Claude Code 會各自寫入此發行版的設定。</small></div><select value={state.integration.wsl.selected||''} onChange={event=>preference({wslDistro:event.target.value})}>{state.integration.wsl.distros.map(distro=><option key={distro} value={distro}>{distro}</option>)}</select></label><p>{state.integration.wsl.codexInstalled?'已安裝 WSL Codex hooks。':'尚未安裝 WSL Codex hooks。'}</p><button className="primary" disabled={busy} onClick={()=>integration('installWslCodex')}>{busy?'處理中…':state.integration.wsl.codexInstalled?'更新 WSL Codex':'連接 WSL Codex'}</button>{state.integration.wsl.codexInstalled&&<button className="subtle" disabled={busy} onClick={()=>integration('uninstallWslCodex')}>解除 WSL Codex</button>}<p>{state.integration.wsl.claudeInstalled?'已安裝 WSL Claude Code hooks。':'尚未安裝 WSL Claude Code hooks。'}</p><button className="primary" disabled={busy} onClick={()=>integration('installWslClaude')}>{busy?'處理中…':state.integration.wsl.claudeInstalled?'更新 WSL Claude Code':'連接 WSL Claude Code'}</button>{state.integration.wsl.claudeInstalled&&<button className="subtle" disabled={busy} onClick={()=>integration('uninstallWslClaude')}>解除 WSL Claude Code</button>}{state.integration.wsl.error&&<p className="error">{state.integration.wsl.error}</p>}</>}</section>
        <section className="settings-card"><div className="section-heading"><h2>氣泡點擊行為</h2><span className="tag">前景視窗</span></div>
          <p>點擊氣泡右下角按鈕時，自動將對應的程式帶到前景。若未安裝 Claude 桌面版，請選擇你用來執行 Claude Code 的終端機。</p>
          {([['claude','Claude Code'] as const,['codex','Codex'] as const]).map(([provider,label])=>{
            const cfg=state.preferences.agentApp[provider];
            return <div key={provider} className="setting" style={{flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
              <strong>{label} 氣泡</strong>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
                <select value={cfg.type} onChange={e=>preference({agentApp:{[provider]:{...cfg,type:e.target.value as AgentAppConfig['type']}}})}>
                  <option value="none">不動作（開啟任務中心）</option>
                  <option value="claude-desktop">Claude 桌面應用 (claude.exe)</option>
                  <option value="wt">Windows Terminal (WindowsTerminal)</option>
                  <option value="cmd">命令提示字元 (cmd)</option>
                  <option value="process">自訂程序名稱</option>
                </select>
                {cfg.type==='process'&&<input type="text" placeholder="例如：wt、pwsh、alacritty" value={cfg.processName||''} style={{flex:1,minWidth:'160px'}}
                  onChange={e=>{const v=e.target.value.trim();if(!v||/^[A-Za-z0-9._-]{1,80}$/.test(v))preference({agentApp:{[provider]:{type:'process',processName:v||undefined}}});}}/>}
              </div>
              {cfg.type!=='none'&&<small className="muted">找到的第一個符合視窗會被帶到前景。若使用 WSL，填入 Windows 側的終端機程序。</small>}
            </div>;
          })}
        </section>
        <section className="settings-card"><h2>桌面與提醒</h2>
          <div className="setting" style={{flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
            <strong>點擊桌寵行為</strong><small className="muted">單擊角色（非拖曳）時的動作</small>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
              {(()=>{const cfg=state.preferences.petClick??{type:'open-panel' as const};return<>
                <select value={cfg.type} onChange={e=>preference({petClick:{...cfg,type:e.target.value as PetClickConfig['type']}})}>
                  <option value="open-panel">開啟任務中心</option>
                  <option value="focus-claude">聚焦 Claude Code 視窗</option>
                  <option value="focus-codex">聚焦 Codex 視窗</option>
                  <option value="wt">Windows Terminal (WindowsTerminal)</option>
                  <option value="cmd">命令提示字元 (cmd)</option>
                  <option value="process">自訂程序名稱</option>
                </select>
                {cfg.type==='process'&&<input type="text" placeholder="例如：wt、pwsh、alacritty" value={cfg.processName||''} style={{flex:1,minWidth:'160px'}}
                  onChange={e=>{const v=e.target.value.trim();if(!v||/^[A-Za-z0-9._-]{1,80}$/.test(v))preference({petClick:{type:'process',processName:v||undefined}});}}/>}
              </>})()}
            </div>
          </div>
          <label className="setting"><div><strong>顯示桌寵</strong><small>透明置頂，拖曳移動，點擊開啟任務中心</small></div><input type="checkbox" checked={!state.preferences.hidden} onChange={e=>preference({hidden:!e.target.checked})}/></label>
          <label className="setting"><div><strong>接收氣泡提醒</strong><small>不搶焦點、不播放聲音；一般氣泡顯示 8 秒</small></div><input type="checkbox" checked={!state.preferences.paused} onChange={e=>preference({paused:!e.target.checked})}/></label>
          <label className="setting"><div><strong>登入 Windows 時啟動</strong><small>預設關閉，安裝版本可使用</small></div><input type="checkbox" checked={state.preferences.launchAtLogin} onChange={e=>preference({launchAtLogin:e.target.checked})}/></label>
        </section><p className="footnote">只顯示來源能確認的資訊。「回合結束」不代表任務成功。回覆與核准請回到 Codex。</p>
      </>}
      <footer><span className="dot connected"/> 安靜陪伴，不打斷你的心流。<span>v0.1.1</span></footer>
    </main>
  </div>;
}
function App(){const state=useSnapshot();if(!state)return null;return new URLSearchParams(location.search).get('view')==='pet'?<Pet state={state}/>:<Panel state={state}/>;}
createRoot(document.getElementById('root')!).render(<App/>);
