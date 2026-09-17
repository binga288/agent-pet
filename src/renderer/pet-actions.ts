import type { PetAPI, PetClickConfig } from '../shared/api';

export async function activatePet(config: PetClickConfig | undefined, api: PetAPI): Promise<void> {
  let result: { ok: boolean } | undefined;
  switch (config?.type) {
    case 'focus-claude': result = await api.focusApp('claude'); break;
    case 'focus-codex': result = await api.focusApp('codex'); break;
    case 'wt': result = await api.focusProcess('WindowsTerminal'); break;
    case 'cmd': result = await api.focusProcess('cmd'); break;
    case 'process':
      if (config.processName) result = await api.focusProcess(config.processName);
      break;
  }
  if (!result?.ok) api.openPanel();
}
