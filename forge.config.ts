import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
const config: ForgeConfig = {
  packagerConfig: { asar: true, executableName: 'agent-pet', extraResource: ['dist/relay/desktop-pet-relay.exe'] },
  makers: [new MakerSquirrel({ name: 'agent_pet', setupExe: 'AgentPetSetup.exe' }), new MakerZIP({}, ['win32'])],
  plugins: [new VitePlugin({
    build: [
      { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
      { entry: 'src/main/preload.ts', config: 'vite.preload.config.ts', target: 'preload' }
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }]
  })]
};
export default config;
