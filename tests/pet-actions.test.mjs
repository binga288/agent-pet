import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activatePet } from '../src/renderer/pet-actions.ts';

test('click targets use the correct bridge method and fall back on focus failure', async () => {
  for (const [config, expected] of [
    [{ type: 'focus-claude' }, ['app', 'claude']],
    [{ type: 'focus-codex' }, ['app', 'codex']],
    [{ type: 'wt' }, ['process', 'WindowsTerminal']],
    [{ type: 'cmd' }, ['process', 'cmd']],
    [{ type: 'process', processName: 'pwsh' }, ['process', 'pwsh']],
  ]) {
    for (const ok of [true, false]) {
      const calls = [];
      await activatePet(config, {
        focusApp: async name => { calls.push(['app', name]); return { ok }; },
        focusProcess: async name => { calls.push(['process', name]); return { ok }; },
        openPanel: () => calls.push(['panel']),
      });
      assert.deepEqual(calls, ok ? [expected] : [expected, ['panel']]);
    }
  }
});

test('default and incomplete click configurations open the panel', async () => {
  for (const config of [undefined, { type: 'open-panel' }, { type: 'process' }]) {
    let opened = 0;
    await activatePet(config, { openPanel: () => opened++ });
    assert.equal(opened, 1);
  }
});
