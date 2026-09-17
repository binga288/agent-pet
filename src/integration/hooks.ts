import { readFile, writeFile, mkdir, rename, unlink, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const MARKER = '--desktop-pet-hook-v1';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'Interrupt', 'SessionEnd', 'PreCompact', 'PostCompact'];
type Obj = Record<string, any>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const owned = (h: Obj) => h.type === 'command' && typeof h.command === 'string' && h.command.endsWith(` ${MARKER}`);

async function load(path: string): Promise<{ doc: Obj; raw?: string }> {
  let raw: string;
  try {
    if ((await stat(path)).size > 1024 * 1024) throw new Error('Hooks file exceeds 1 MiB; refusing to edit');
    raw = await readFile(path, 'utf8');
  } catch (e: any) { if (e.code === 'ENOENT') return { doc: {} }; throw e; }
  const doc: unknown = JSON.parse(raw);
  if (!object(doc) || (doc.hooks !== undefined && !object(doc.hooks))) throw new Error('Malformed hooks configuration; refusing to edit');
  for (const groups of Object.values(doc.hooks ?? {})) {
    if (!Array.isArray(groups) || groups.some(g => !object(g) || !Array.isArray(g.hooks) || g.hooks.some((h: unknown) => !object(h)))) throw new Error('Malformed hook entries; refusing to edit');
  }
  return { doc, raw };
}

async function save(path: string, doc: Obj, raw?: string) {
  const next = `${JSON.stringify(doc, null, 2)}\n`;
  if (next === raw) return;
  await mkdir(dirname(path), { recursive: true });
  const suffix = `${Date.now()}-${randomUUID()}`;
  if (raw !== undefined) await writeFile(`${path}.desktop-pet-backup-${suffix}`, raw, { flag: 'wx' });
  const tmp = `${path}.desktop-pet-${suffix}.tmp`;
  try {
    await writeFile(tmp, next, { flag: 'wx' });
    // Refuse if another process edited the file while this update was being prepared.
    const current = await readFile(path, 'utf8').catch((e: any) => { if (e.code === 'ENOENT') return undefined; throw e; });
    if (current !== raw) throw new Error('Hooks changed concurrently; retry the operation');
    await rename(tmp, path);
  } finally { await unlink(tmp).catch(() => {}); }
}

function removeOwned(doc: Obj) {
  for (const [event, groups] of Object.entries(doc.hooks ?? {}) as [string, Obj[]][]) {
    doc.hooks[event] = groups.flatMap(group => {
      const remaining = group.hooks.filter((h: Obj) => !owned(h));
      if (remaining.length === group.hooks.length) return [group];
      // Keep extra group metadata even if its owned handler was removed.
      return remaining.length || Object.keys(group).some(k => k !== 'hooks') ? [{ ...group, hooks: remaining }] : [];
    });
    if (!doc.hooks[event].length) delete doc.hooks[event];
  }
}

export async function installHooks(path: string, command: string, commandWindows?: string, timeout = 1): Promise<void> {
  if (!command.trim() || /[\r\n]/.test(command)) throw new Error('Invalid relay command');
  if (commandWindows !== undefined && (!commandWindows.trim() || /[\r\n]/.test(commandWindows))) throw new Error('Invalid Windows relay command');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30) throw new Error('Invalid hook timeout');
  const { doc, raw } = await load(path);
  removeOwned(doc);
  doc.hooks ??= {};
  for (const event of EVENTS) {
    doc.hooks[event] ??= [];
    doc.hooks[event].push({ hooks: [{ type: 'command', command: `${command} ${MARKER}`,
      ...(commandWindows ? {commandWindows: `${commandWindows} ${MARKER}`} : {}), timeout }] });
  }
  await save(path, doc, raw);
}

export async function uninstallHooks(path: string): Promise<void> {
  const { doc, raw } = await load(path);
  if (raw === undefined) return;
  const before = JSON.stringify(doc);
  removeOwned(doc);
  if (JSON.stringify(doc) !== before) await save(path, doc, raw);
}

export async function hooksInstalled(path: string): Promise<boolean> {
  const { doc } = await load(path);
  return EVENTS.every(event => doc.hooks?.[event]?.some((g: Obj) => g.hooks.some(owned)));
}
