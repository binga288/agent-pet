import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';
import { win32 } from 'node:path';
import { installHooks, uninstallHooks } from './hooks';
import { installClaudeHooks, uninstallClaudeHooks } from './claude-hooks';

export type WslProvider='codex'|'claude';
export interface WslHookTarget {
  distro:string;
  provider:WslProvider;
  relayPath:string;
  connectionPath:string;
  /** Writable UNC path used by Windows to create the shim. */
  shimPath:string;
  /** POSIX path stored in the WSL hook configuration. */
  shimCommandPath:string;
  codexHooksPath:string;
  claudeHooksPath:string;
}

const validDistro=(value:string)=>/^[A-Za-z0-9._-]{1,80}$/.test(value);
const quote=(value:string)=>`'${value.replace(/'/g,"'\\''")}'`;
export const stableWslRelayPath=(localAppData:string)=>win32.join(localAppData,'Agent Pet','bin','agent-pet-wsl-relay.exe');
export const wslExecutable=(systemRoot:string)=>win32.join(systemRoot,'System32','wsl.exe');
export function parseWslDistros(output:string):string[]{
  return [...new Set(output.replaceAll('\u0000','').split(/\r?\n/).map(name=>name.trim()).filter(validDistro))];
}
export function windowsPathToWsl(path:string):string{
  const match=/^([A-Za-z]):\\(.*)$/.exec(path);
  if(!match)throw Error('Expected absolute Windows path');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\','/')}`;
}
function windowsPathForWindowsProcess(path:string):string{
  if(!/^[A-Za-z]:\\/.test(path))throw Error('Expected absolute Windows path');
  return path.replaceAll('\\','/');
}
export function buildWslShim(target:Pick<WslHookTarget,'distro'|'provider'|'relayPath'|'connectionPath'>):string{
  if(!validDistro(target.distro))throw Error('Invalid WSL distribution');
  // The executable is launched by Linux, but it runs as a Windows process.
  // Its data-file arguments must therefore remain Windows paths.
  return `#!/bin/sh\nset -eu\nexec ${quote(windowsPathToWsl(target.relayPath))} --connection ${quote(windowsPathForWindowsProcess(target.connectionPath))} --provider ${target.provider} --origin wsl:${target.distro} "$@"\n`;
}
export function wslHomePath(home:string, ...parts:string[]):string{
  if(!/^\/[A-Za-z0-9._/-]{1,512}$/.test(home))throw Error('Invalid WSL home path');
  return posix.join(home,...parts);
}
export async function installWslHooks(target:WslHookTarget):Promise<void>{
  await mkdir(dirname(target.shimPath),{recursive:true});
  await writeFile(target.shimPath,buildWslShim(target),{encoding:'utf8',mode:0o700});
  const command=quote(target.shimCommandPath);
  // WSL interop has startup overhead, so it needs more time than native hooks.
  if(target.provider==='codex')await installHooks(target.codexHooksPath,command,undefined,5);
  else await installClaudeHooks(target.claudeHooksPath,command,'bash',5);
}
export async function uninstallWslHooks(target:WslHookTarget):Promise<void>{
  if(target.provider==='codex')await uninstallHooks(target.codexHooksPath);
  else await uninstallClaudeHooks(target.claudeHooksPath);
}
