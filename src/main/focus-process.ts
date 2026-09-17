import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Shared Windows implementation; IPC sender checks remain in the main process.
export async function focusProcess(processName: unknown): Promise<{ ok: boolean }> {
  if (typeof processName !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(processName)) return { ok: false };
    const procArg=processName.replace(/\.exe$/i,'');
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(procArg))return {ok:false};
    const ps=`try{Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class AgentPetW32{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);}'}catch{}; $p=Get-Process -Name '${procArg}' -EA SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|Select-Object -First 1; if($p){[AgentPetW32]::ShowWindow($p.MainWindowHandle,9);[AgentPetW32]::SetForegroundWindow($p.MainWindowHandle)}`;
    try{await execFileAsync('powershell.exe',['-NonInteractive','-NoProfile','-Command',ps],{windowsHide:true,timeout:5000});return {ok:true};}
    catch{return {ok:false};}
}
