import { win32 } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

// Other Windows applications cannot see MSIX filesystem aliases.
export function buildClaudeRelayCommand(relayPath: string, connectionPath: string): string {
  return `${buildRelayCommandWindows(realpathSync.native(relayPath), realpathSync.native(connectionPath))} --provider claude`;
}

// A portable build of the same version must not replace an installed hook path.
// Changing only that path invalidates Codex's trust hash.
export function selectPackagedRelay(resourcesPath: string, localAppData: string, version: string): string {
  const installed = win32.join(localAppData,'agent_pet',`app-${version}`,'resources','desktop-pet-relay.exe');
  return existsSync(installed) ? installed : win32.join(resourcesPath,'desktop-pet-relay.exe');
}

/** Build a Windows cmd command compatible with Codex's outer-quoted /C runner. */
export function buildRelayCommand(relayPath: string, connectionPath: string, packaged: boolean): string {
  const quote = (value: string) => {
    // CALL performs another expansion pass. Refuse expansion/control characters
    // instead of attempting context-dependent cmd escaping of user directories.
    if (!win32.isAbsolute(value) || /["%!^\x00-\x1f]/.test(value) || value.endsWith('\\')) {
      throw new Error('此路徑無法安全用於 Windows hook');
    }
    return `"${value}"`;
  };
  const relay = quote(relayPath);
  const connection = quote(connectionPath);
  return `${packaged ? 'call' : 'node'} ${relay} --connection ${connection}`;
}

/** Windows desktop hooks run under PowerShell, where cmd's `call` is invalid. */
export function buildRelayCommandWindows(relayPath: string, connectionPath: string): string {
  const quote = (value: string) => {
    if (!win32.isAbsolute(value) || /["%!^\x00-\x1f]/.test(value) || value.endsWith('\\')) {
      throw new Error('此路徑無法安全用於 Windows hook');
    }
    return `"${value}"`;
  };
  return `& ${quote(relayPath)} --connection ${quote(connectionPath)}`;
}
