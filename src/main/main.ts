import { defaultPetId, findPet, parsePet } from '../shared/pets';
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, protocol, screen, shell, Tray } from 'electron';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, unlinkSync, copyFileSync, renameSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeHook } from '../core/codex-adapter';
import { normalizeClaudeHook } from '../core/claude-adapter';
import { TaskStore } from '../core/task-store';
import { NotificationQueue } from '../core/notification-queue';
import { startReceiver } from '../integration/server';
import { installHooks, uninstallHooks, hooksInstalled } from '../integration/hooks';
import { installClaudeHooks, uninstallClaudeHooks, claudeHooksInstalled } from '../integration/claude-hooks';
import { buildRelayCommand, buildRelayCommandWindows, buildClaudeRelayCommand, selectPackagedRelay } from '../integration/command';
import { installWslHooks, parseWslDistros, stableWslRelayPath, uninstallWslHooks, wslExecutable, wslHomePath, type WslHookTarget, type WslProvider } from '../integration/wsl';
import { readSaved, saveState } from './storage';
import type { AgentAppConfig, PetClickConfig, Preferences, UserPetMeta } from '../shared/api';
import { fitPet } from '../shared/animation';
import type { AppSnapshot } from '../shared/api';
import squirrelStartup from 'electron-squirrel-startup';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
const execFileAsync=promisify(execFile);
const validDistro=(value:string)=>/^[A-Za-z0-9._-]{1,80}$/.test(value);
function wslUncPath(distro:string, linuxPath:string):string {
  if(!validDistro(distro)||!/^\/[A-Za-z0-9._/-]{1,512}$/.test(linuxPath))throw Error('無效的 WSL 路徑');
  return `\\\\wsl.localhost\\${distro}${linuxPath.replaceAll('/','\\')}`;
}
// Must be called before app ready — registers the pet-asset:// scheme for sandboxed renderers.
protocol.registerSchemesAsPrivileged([{scheme:'pet-asset',privileges:{bypassCSP:true,supportFetchAPI:true,secure:true,standard:true}}]);
// Squirrel maintenance launches should never start the event receiver.
if (process.env.AGENT_PET_DATA_DIR) app.setPath('userData', path.resolve(process.env.AGENT_PET_DATA_DIR));
if (squirrelStartup) { /* Shortcut maintenance exits through Squirrel's callback. */ }
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  void app.whenReady().then(start).catch(error => { console.error('Agent Pet startup failed:',error); app.quit(); });
}

const userPetsDir = path.join(os.homedir(), 'pets');
interface CachedUserPet extends UserPetMeta { filePath: string; }
let cachedUserPets: CachedUserPet[] = [];
async function scanUserPets(): Promise<{count:number;errors:string[]}> {
  const results: CachedUserPet[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  try {
    mkdirSync(userPetsDir, {recursive:true});
    const entries = readdirSync(userPetsDir, {withFileTypes:true});
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const dir = path.join(userPetsDir, entry.name);
        const raw = JSON.parse(readFileSync(path.join(dir,'pet.json'),'utf8'));
        const def = parsePet(raw);
        if (findPet(def.id)) { errors.push(`${entry.name}: ID "${def.id}" 與內建角色衝突，已略過`); continue; }
        if (seenIds.has(def.id)) { errors.push(`${entry.name}: ID "${def.id}" 重複，已略過`); continue; }
        seenIds.add(def.id);
        results.push({id:def.id,displayName:def.displayName,description:def.description,
          animations:def.animations,...(def.walkAnimation?{walkAnimation:def.walkAnimation}:{}),
          filePath:path.join(dir,'spritesheet.webp')});
      } catch(e) { errors.push(`${entry.name}: ${e instanceof Error?e.message:String(e)}`); }
    }
  } catch(e) { errors.push(String(e)); }
  cachedUserPets = results;
  return {count:results.length,errors};
}

async function start() {
  const wslExe=wslExecutable(process.env.SystemRoot||'C:\\Windows');
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir,{recursive:true});
  const saved = readSaved(dataDir);
  const preferences = saved.preferences;
  const store = new TaskStore(); store.restore(saved.history);
  const queue = new NotificationQueue(); queue.setPaused(preferences.paused);
  const hooksPath = path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'hooks.json');
  const claudeHooksPath = path.join(os.homedir(),'.claude','settings.json');
  const connectionPath = path.join(dataDir,'connection.json');
  let installed = false;
  let claudeInstalled = false;
  let wslDistros:string[]=[];
  let wslCodexInstalled=false;
  let wslClaudeInstalled=false;
  let wslError:string|undefined;
  let lastEventAt: number | undefined;
  let integrationError: string | undefined;
  await scanUserPets();
  if (!findPet(preferences.petId) && !cachedUserPets.find(p=>p.id===preferences.petId)) preferences.petId = defaultPetId;
  protocol.handle('pet-asset', request => {
    const petId = new URL(request.url).searchParams.get('id') ?? '';
    const cached = cachedUserPets.find(p => p.id === petId);
    if (!cached) return new Response(null, {status:404});
    try { return new Response(readFileSync(cached.filePath), {headers:{'Content-Type':'image/webp'}}); }
    catch { return new Response(null, {status:500}); }
  });
  try { installed=await hooksInstalled(hooksPath); } catch { integrationError='既有 hooks 設定無法讀取；桌寵仍可使用，請先檢查設定格式。'; }
  try { claudeInstalled=await claudeHooksInstalled(claudeHooksPath); } catch { integrationError ??= 'Claude Code 設定無法讀取；請先檢查 settings.json 格式。'; }
  async function getWslTarget(provider:WslProvider):Promise<WslHookTarget>{
    const distro=preferences.wslDistro;
    if(!distro||!wslDistros.includes(distro))throw Error('請先選擇 WSL 發行版');
    const {stdout}=await execFileAsync(wslExe,['-d',distro,'--','sh','-lc','printf %s "$HOME"'],{windowsHide:true,maxBuffer:4096});
    const home=stdout.trim();
    const shimCommandPath=wslHomePath(home,'.local','share','agent-pet',`relay-${provider}.sh`);
    return {distro,provider,relayPath:provisionWslRelay(),connectionPath,shimPath:wslUncPath(distro,shimCommandPath),shimCommandPath,
      codexHooksPath:wslUncPath(distro,wslHomePath(home,'.codex','hooks.json')),
      claudeHooksPath:wslUncPath(distro,wslHomePath(home,'.claude','settings.json'))};
  }
  function provisionWslRelay():string{
    if(!app.isPackaged)throw Error('WSL 整合需要已打包的 Agent Pet');
    const source=path.join(process.resourcesPath,'desktop-pet-relay.exe');
    if(!existsSync(source))throw Error('找不到 WSL relay');
    const localAppData=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local');
    const destination=stableWslRelayPath(localAppData);
    mkdirSync(path.dirname(destination),{recursive:true});
    const temporary=`${destination}.${process.pid}.tmp`;
    copyFileSync(source,temporary);renameSync(temporary,destination);
    return destination;
  }
  async function refreshWslState(){
    wslCodexInstalled=false;wslClaudeInstalled=false;wslError=undefined;
    if(!preferences.wslDistro)return;
    try {const codex=await getWslTarget('codex');wslCodexInstalled=await hooksInstalled(codex.codexHooksPath);}
    catch(error){wslError=error instanceof Error?error.message:String(error);return;}
    try {const claude=await getWslTarget('claude');wslClaudeInstalled=await claudeHooksInstalled(claude.claudeHooksPath);}
    catch(error){wslError=error instanceof Error?error.message:String(error);}
  }
  try {
    const {stdout}=await execFileAsync(wslExe,['-l','-q'],{windowsHide:true,maxBuffer:4096});
    wslDistros=parseWslDistros(stdout);
    if(!preferences.wslDistro||!wslDistros.includes(preferences.wslDistro))preferences.wslDistro=wslDistros[0];
    await refreshWslState();
  } catch {wslError='找不到可用的 WSL 發行版';}
  const observed = new Set<string>();
  let closing = false;
  const side = 'right' as const;
  const pet = new BrowserWindow({
    title:'Agent Pet', width:320,height:360,frame:false,transparent:true,alwaysOnTop:true,
    resizable:false,skipTaskbar:true,show:false,focusable:false,hasShadow:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  let panel: BrowserWindow | undefined;
  const secure = (win: BrowserWindow) => {
    win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc,_perm,callback)=>callback(false));
  };
  secure(pet);
  const load = async (win: BrowserWindow, view: string) => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) await win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=${view}`);
    else await win.loadFile(path.join(__dirname,`../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),{query:{view}});
  };
  function snapshot(): AppSnapshot {
    return {tasks:store.tasks(),history:store.history(),notification:queue.current(Date.now()),
      preferences:{...preferences},bubbleSide:side,
      userPets:cachedUserPets.map(({filePath:_,...meta})=>meta as UserPetMeta),
      integration:{installed,claudeInstalled,receiving:lastEventAt!==undefined,lastEventAt,observed:[...observed],error:integrationError,
        wsl:{distros:[...wslDistros],selected:preferences.wslDistro,codexInstalled:wslCodexInstalled,claudeInstalled:wslClaudeInstalled,...(wslError?{error:wslError}:{})}}};
  }
  let lastPublished='';
  function publish() {
    const state = snapshot();
    const signature=JSON.stringify(state);
    if(signature===lastPublished)return;
    lastPublished=signature;
    for (const win of [pet,panel]) if(win&&!win.isDestroyed()) win.webContents.send('pet:update',state);
  }
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{try {saveState(dataDir,preferences,store.history());} catch {integrationError='無法儲存設定，請檢查資料目錄';publish();}},200);
  }
  function position(point = preferences.position) {
    const display = point ? screen.getDisplayNearestPoint(point) : screen.getPrimaryDisplay();
    const area = display.workArea;
    const layout = fitPet(point || {x:area.x+area.width-224,y:area.y+area.height-230},area);
    pet.setBounds({x:layout.x,y:layout.y,width:layout.width,height:layout.height});
    preferences.position={x:layout.petX,y:layout.petY};
  }
  position();
  pet.setIgnoreMouseEvents(true,{forward:true});
  function showPanel() {
    if(panel&&!panel.isDestroyed()) {panel.show();panel.focus();return;}
    panel = new BrowserWindow({title:'Agent Pet · 任務中心',width:880,height:720,minWidth:620,minHeight:500,
      backgroundColor:'#10151d',show:false,autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    secure(panel);
    panel.once('ready-to-show',()=>panel?.show());
    void load(panel,'panel');
  }
  // Native image is generated locally, so no downloaded icon dependency is needed.
  // Windows tray image from raw RGBA pixels.
  const rgba=Buffer.alloc(24*24*4);
  for(let y=0;y<24;y++)for(let x=0;x<24;x++) {const i=(y*24+x)*4;const eye=y>=8&&y<=11&&(x>=5&&x<=8||x>=15&&x<=18);rgba[i]=eye?20:114;rgba[i+1]=eye?30:215;rgba[i+2]=eye?25:181;rgba[i+3]=(x-12)**2+(y-12)**2<140?255:0;}
  const tray = new Tray(nativeImage.createFromBitmap(rgba,{width:24,height:24}));
  tray.setToolTip('Agent Pet · AI 任務狀態');
  function trayMenu() {
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'開啟任務中心',click:showPanel},
      {label:preferences.paused?'恢復提醒':'暫停提醒',click:()=>{preferences.paused=!preferences.paused;queue.setPaused(preferences.paused);persist();publish();trayMenu();}},
      {label:preferences.hidden?'顯示桌寵':'隱藏桌寵',click:()=>{preferences.hidden=!preferences.hidden;preferences.hidden?pet.hide():pet.showInactive();persist();publish();trayMenu();}},
      {type:'separator'},{label:'退出',click:()=>app.quit()}
    ]));
  }
  trayMenu();tray.on('double-click',showPanel);
  const receiver = await startReceiver(randomToken(), payload => {
    const provider=(payload as {provider?:unknown}).provider;
    const event = provider==='claude'?normalizeClaudeHook(payload):normalizeHook(payload);
    if (!store.apply(event)) return;
    lastEventAt=Date.now();
    const hook = (payload as {hook?:{hook_event_name?:string}}).hook?.hook_event_name;
    if(hook) observed.add(hook);
    queue.push(event);persist();publish();
  });
  function randomToken() {
    const token=randomBytes(32).toString('hex');
    // Port is filled after bind; the token is never sent to a renderer.
    writeFileSync(connectionPath,JSON.stringify({port:0,token}),{mode:0o600});
    return token;
  }
  const credentials=JSON.parse(readFileSync(connectionPath,'utf8'));
  writeFileSync(connectionPath,JSON.stringify({...credentials,port:receiver.port}),{mode:0o600});
  function trusted(senderId: number) { return senderId===pet.webContents.id || !!panel&&!panel.isDestroyed()&&senderId===panel.webContents.id; }
  ipcMain.handle('pet:snapshot',event=>{if(!trusted(event.sender.id))throw Error('Untrusted sender');return snapshot();});
  ipcMain.handle('pet:preferences',async(event,patch:unknown)=>{
    if(!trusted(event.sender.id)||!patch||typeof patch!=='object')throw Error('Invalid preferences');
    if ('petId' in patch) {
      const id = (patch as Record<string,unknown>).petId;
      if (!findPet(id) && !cachedUserPets.find(p=>p.id===id)) throw Error('Unknown pet');
      preferences.petId = id as string;
    }
    if('wslDistro' in patch){
      const distro=(patch as Record<string,unknown>).wslDistro;
      if(typeof distro!=='string'||!wslDistros.includes(distro))throw Error('無效的 WSL 發行版');
      preferences.wslDistro=distro;
      await refreshWslState();
    }
    for(const key of ['paused','hidden','launchAtLogin'] as const) {
      if(key in patch) {
        const value=(patch as Record<string,unknown>)[key];
        if(typeof value!=='boolean')throw Error('Invalid preference value');
        if(key==='launchAtLogin' && !app.isPackaged) throw Error('開機啟動僅適用安裝版本');
        preferences[key]=value;
        if(key==='launchAtLogin') {
          const updater=path.resolve(path.dirname(process.execPath),'..','Update.exe');
          app.setLoginItemSettings(existsSync(updater)?{openAtLogin:value,path:updater,args:['--processStart',path.basename(process.execPath)]}:{openAtLogin:value,path:process.execPath});
        }
      }
    }
    if('agentApp' in patch) {
      const agentApp=(patch as Record<string,unknown>).agentApp;
      if(!agentApp||typeof agentApp!=='object') throw Error('Invalid agentApp');
      const validTypes=['none','claude-desktop','wt','cmd','process'] as const;
      for(const provider of ['claude','codex'] as const) {
        if(!(provider in (agentApp as Record<string,unknown>))) continue;
        const cfg=(agentApp as Record<string,unknown>)[provider];
        if(!cfg||typeof cfg!=='object') throw Error('Invalid agentApp config');
        const type=(cfg as Record<string,unknown>).type;
        if(!validTypes.includes(type as AgentAppConfig['type'])) throw Error('Invalid agentApp type');
        const processName=(cfg as Record<string,unknown>).processName;
        if(processName!==undefined&&(typeof processName!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(processName))) throw Error('Invalid processName');
        preferences.agentApp[provider]={type:type as AgentAppConfig['type'],...(typeof processName==='string'?{processName}:{})};
      }
    }
    if('petClick' in patch) {
      const v=(patch as Record<string,unknown>).petClick;
      if(!v||typeof v!=='object') throw Error('Invalid petClick');
      const obj=v as Record<string,unknown>;
      const validTypes=['open-panel','focus-claude','focus-codex','wt','cmd','process'] as const;
      if(!validTypes.includes(obj.type as PetClickConfig['type'])) throw Error('Invalid petClick type');
      const pn=obj.processName;
      if(pn!==undefined&&(typeof pn!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(pn))) throw Error('Invalid petClick processName');
      preferences.petClick={type:obj.type as PetClickConfig['type'],...(typeof pn==='string'?{processName:pn}:{})};
    }
    queue.setPaused(preferences.paused);
    preferences.hidden?pet.hide():pet.showInactive();persist();publish();trayMenu();
  });
  ipcMain.on('pet:panel',event=>{if(trusted(event.sender.id))showPanel();});
  ipcMain.on('pet:dismiss',event=>{if(trusted(event.sender.id)){queue.dismiss(Date.now());publish();}});
  ipcMain.on('pet:interactive',(event,value)=>{if(event.sender.id===pet.webContents.id&&typeof value==='boolean')pet.setIgnoreMouseEvents(!value,{forward:true});});
  let drag: {cursor:Electron.Point;origin:Electron.Point}|undefined;
  ipcMain.on('pet:drag',(event,phase)=>{
    if(event.sender.id!==pet.webContents.id)return;
    if(phase==='start')drag={cursor:screen.getCursorScreenPoint(),origin:preferences.position!};
    else if(drag&&(phase==='move'||phase==='end')) {
      const cursor=screen.getCursorScreenPoint();
      const newPoint={x:drag.origin.x+cursor.x-drag.cursor.x,y:drag.origin.y+cursor.y-drag.cursor.y};
      if(phase==='end'){drag=undefined;persist();}
      position(newPoint);publish();
    }
  });
  ipcMain.handle('pet:copy',(event,text)=>{if(!trusted(event.sender.id)||typeof text!=='string'||text.length>2000)throw Error('Invalid copy');clipboard.writeText(text);});
  ipcMain.handle('pet:focusApp',async(event,provider:unknown)=>{
    if(!trusted(event.sender.id))throw Error('Untrusted');
    if(provider!=='claude'&&provider!=='codex')return {ok:false};
    const cfg=preferences.agentApp[provider];
    if(!cfg||cfg.type==='none')return {ok:false};
    const nameMap:Record<string,string>={'claude-desktop':'claude','wt':'WindowsTerminal','cmd':'cmd'};
    let processName=cfg.type==='process'?(cfg.processName||''):nameMap[cfg.type]||'';
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(processName))return {ok:false};
    // strip .exe suffix for Get-Process
    const procArg=processName.replace(/\.exe$/i,'');
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(procArg))return {ok:false};
    const ps=`try{Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class AgentPetW32{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}'}catch{}; $p=Get-Process -Name '${procArg}' -EA SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|Select-Object -First 1; if($p){[AgentPetW32]::ShowWindow($p.MainWindowHandle,9);[AgentPetW32]::SetForegroundWindow($p.MainWindowHandle)}`;
    try{await execFileAsync('powershell.exe',['-NonInteractive','-NoProfile','-Command',ps],{windowsHide:true,timeout:5000});return {ok:true};}
    catch{return {ok:false};}
  });
  ipcMain.handle('pet:focusProcess',async(event,processName:unknown)=>{
    if(!trusted(event.sender.id))throw Error('Untrusted');
    if(typeof processName!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(processName))return {ok:false};
    const procArg=processName.replace(/\.exe$/i,'');
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(procArg))return {ok:false};
    const ps=`try{Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class AgentPetW32{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}'}catch{}; $p=Get-Process -Name '${procArg}' -EA SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|Select-Object -First 1; if($p){[AgentPetW32]::ShowWindow($p.MainWindowHandle,9);[AgentPetW32]::SetForegroundWindow($p.MainWindowHandle)}`;
    try{await execFileAsync('powershell.exe',['-NonInteractive','-NoProfile','-Command',ps],{windowsHide:true,timeout:5000});return {ok:true};}
    catch{return {ok:false};}
  });
  ipcMain.handle('pet:refreshUserPets',async event=>{
    if(!trusted(event.sender.id))throw Error('Untrusted');
    const result=await scanUserPets();
    publish();
    return result;
  });
  ipcMain.handle('pet:openUserPetsDir',async event=>{
    if(!trusted(event.sender.id))throw Error('Untrusted');
    mkdirSync(userPetsDir,{recursive:true});
    await shell.openPath(userPetsDir);
  });
  let changingHooks = false;
  ipcMain.handle('pet:integration',async(event,action)=>{
    if(!trusted(event.sender.id)||!['install','uninstall','installClaude','uninstallClaude','installWslCodex','uninstallWslCodex','installWslClaude','uninstallWslClaude'].includes(action))throw Error('Invalid action');
    if(changingHooks)return {ok:false,message:'正在更新連線設定'};
    changingHooks=true;
    try {
      if(action==='install') {
        const relay=app.isPackaged?selectPackagedRelay(process.resourcesPath,process.env.LOCALAPPDATA || path.join(path.dirname(app.getPath('appData')),'Local'),app.getVersion()):path.join(app.getAppPath(),'scripts','relay.cjs');
        if(!existsSync(relay))throw Error('找不到事件轉送器');
        // A packaged standalone relay never depends on Node being on PATH.
        const command=buildRelayCommand(relay,connectionPath,app.isPackaged);
        await installHooks(hooksPath,command,app.isPackaged ? buildRelayCommandWindows(relay,connectionPath) : undefined);
      } else if(action==='uninstall') await uninstallHooks(hooksPath);
      else if(action==='installWslCodex'||action==='uninstallWslCodex'||action==='installWslClaude'||action==='uninstallWslClaude') {
        const provider:WslProvider=action.endsWith('Codex')?'codex':'claude';
        const target=await getWslTarget(provider);
        if(action.startsWith('install')) {
          await installWslHooks(target);
          await execFileAsync(wslExe,['-d',target.distro,'--','chmod','700',target.shimCommandPath],{windowsHide:true});
        } else await uninstallWslHooks(target);
        await refreshWslState();publish();
        return {ok:true,message:action.startsWith('install')?`已合併 WSL ${provider==='codex'?'Codex':'Claude Code'} hooks；收到事件後才確認連線。`:`已移除 WSL ${provider==='codex'?'Codex':'Claude Code'} hooks。`};
      } else {
        const relay=app.isPackaged?selectPackagedRelay(process.resourcesPath,process.env.LOCALAPPDATA || path.join(path.dirname(app.getPath('appData')),'Local'),app.getVersion()):path.join(app.getAppPath(),'scripts','relay.cjs');
        if(!existsSync(relay))throw Error('找不到事件轉送器');
        const command=app.isPackaged?buildClaudeRelayCommand(relay,connectionPath):`node "${relay}" --connection "${connectionPath}" --provider claude`;
        if(action==='installClaude') await installClaudeHooks(claudeHooksPath,command); else await uninstallClaudeHooks(claudeHooksPath);
      }
      installed=await hooksInstalled(hooksPath);integrationError=undefined;publish();
      claudeInstalled=await claudeHooksInstalled(claudeHooksPath);
      return {ok:true,message:action==='install'?'已合併設定。請在 Codex /hooks 檢查並信任新增 hooks，再開始新回合。':action==='installClaude'?'已合併 Claude Code hooks。請重新開啟 Claude Code，然後開始新回合。':action==='uninstallClaude'?'已移除 Agent Pet 的 Claude Code hooks，其他設定保留。':'已移除 Agent Pet hooks，其他設定保留。'};
    } catch(error) {integrationError=error instanceof Error?error.message:String(error);publish();return {ok:false,message:integrationError};}
    finally {changingHooks=false;}
  });
  screen.on('display-metrics-changed',()=>{position();publish();persist();});
  screen.on('display-removed',()=>{position();publish();persist();});
  const timer=setInterval(publish,250);
  pet.once('ready-to-show',()=>{if(!preferences.hidden)pet.showInactive();});
  await load(pet,'pet');
  if(!installed && !process.env.AGENT_PET_NO_PANEL)showPanel();
  app.on('second-instance',showPanel);
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{
    if(closing)return;closing=true;clearInterval(timer);clearTimeout(saveTimer);
    try{saveState(dataDir,preferences,store.history());unlinkSync(connectionPath);}catch{}
    void receiver.close();tray.destroy();
  });
}
