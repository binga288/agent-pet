import type { AgentStatus, TaskState } from '../core/types';
import type { AppSnapshot } from '../shared/api';

export const labels: Record<AgentStatus,string>={unknown:'尚未確認',idle:'閒置',working:'工作中',tool:'執行工具',waiting:'等待確認',ended:'回合結束',interrupted:'已中斷',failed:'失敗'};
export const providerLabel={codex:'Codex',claude:'Claude Code'} as const;
const rank:Record<AgentStatus,number>={waiting:5,failed:4,ended:3,interrupted:2,tool:1,working:1,idle:0,unknown:0};

export function sortTasks(tasks: TaskState[]): TaskState[] {
  return [...tasks].sort((a, b) => rank[b.status] - rank[a.status] || b.updatedAt - a.updatedAt);
}

export function selectPetStatus(tasks: TaskState[], notification: AppSnapshot['notification']): AgentStatus {
  const ongoing = sortTasks(tasks).find(task => ['waiting', 'failed', 'working', 'tool'].includes(task.status));
  return notification?.kind || ongoing?.status || 'idle';
}
