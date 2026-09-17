import type { AgentEvent, AgentProvider, AgentStatus, TaskState } from '../core/types';
import type { Animation } from './animation';
export interface AgentAppConfig {
  type: 'none' | 'claude-desktop' | 'wt' | 'cmd' | 'process';
  processName?: string;
}
export interface PetClickConfig {
  type: 'open-panel' | 'focus-claude' | 'focus-codex' | 'wt' | 'cmd' | 'process';
  processName?: string;
}
export interface Preferences { petId: string; paused: boolean; hidden: boolean; launchAtLogin: boolean; wslDistro?: string; position?: { x: number; y: number }; agentApp: { claude: AgentAppConfig; codex: AgentAppConfig }; petClick?: PetClickConfig }
export interface UserPetMeta {
  id: string; displayName: string; description: string;
  animations: Record<AgentStatus, Animation>;
  walkAnimation?: Animation;
}
export interface AppSnapshot {
  tasks: TaskState[]; history: AgentEvent[]; notification: AgentEvent | null;
  preferences: Preferences; bubbleSide: 'left' | 'right'; userPets: UserPetMeta[];
  integration: { installed: boolean; claudeInstalled: boolean; receiving: boolean; lastEventAt?: number; observed: string[]; error?: string;
    wsl: { distros: string[]; selected?: string; codexInstalled: boolean; claudeInstalled: boolean; error?: string } };
}
export interface PetAPI {
  snapshot(): Promise<AppSnapshot>;
  subscribe(callback: (snapshot: AppSnapshot) => void): () => void;
  preferences(patch: Partial<Pick<Preferences, 'petId' | 'paused' | 'hidden' | 'launchAtLogin' | 'wslDistro'>> & { agentApp?: { claude?: AgentAppConfig; codex?: AgentAppConfig }; petClick?: PetClickConfig }): Promise<void>;
  focusProcess(processName: string): Promise<{ ok: boolean }>;
  openPanel(): void; dismiss(): void; interactive(value: boolean): void;
  drag(phase: 'start' | 'move' | 'end'): void;
  copy(text: string): Promise<void>;
  focusApp(provider: AgentProvider): Promise<{ ok: boolean }>;
  integration(action: 'install' | 'uninstall' | 'installClaude' | 'uninstallClaude' | 'installWslCodex' | 'uninstallWslCodex' | 'installWslClaude' | 'uninstallWslClaude'): Promise<{ ok: boolean; message: string }>;
  refreshUserPets(): Promise<{ count: number; errors: string[] }>;
  openUserPetsDir(): Promise<void>;
}
declare global { interface Window { pet: PetAPI } }
