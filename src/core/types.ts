export type AgentStatus = 'unknown' | 'idle' | 'working' | 'tool' | 'waiting' | 'ended' | 'interrupted' | 'failed';
export type AgentProvider = 'codex' | 'claude';

export interface AgentEvent {
  version: 1;
  id: string;
  provider: AgentProvider;
  origin?: string;
  sessionId: string;
  turnId?: string;
  kind: AgentStatus;
  receivedAt: number;
  summary: string;
  taskName?: string;
  toolId?: string;
  /** Source evidence from UserPromptSubmit, including hooks without turn_id. */
  startsTurn?: boolean;
}

export interface TaskState {
  key: string;
  provider: AgentProvider;
  origin?: string;
  sessionId: string;
  turnId?: string;
  status: AgentStatus;
  summary: string;
  updatedAt: number;
  taskName?: string;
}
