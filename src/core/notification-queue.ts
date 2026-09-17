import type { AgentEvent } from './types';
export class NotificationQueue {
  private pending: AgentEvent[] = [];
  private active: { event: AgentEvent; until: number } | null = null;
  private paused = false;

  push(event: AgentEvent): void {
    // Only accepted store events enter the queue; each replaces that session's old state.
    const superseded = (e: AgentEvent) => e.provider === event.provider && e.origin === event.origin && e.sessionId === event.sessionId;
    this.pending = this.pending.filter(e => !superseded(e));
    if (this.active && superseded(this.active.event)) this.active = null;
    if (!['waiting', 'failed', 'ended', 'working', 'tool', 'interrupted'].includes(event.kind)) return;
    if (this.active && priority(event) > priority(this.active.event)) {
      this.pending.unshift(this.active.event);
      this.active = null;
    }
    this.pending.push({ ...event });
    this.pending.sort((a, b) => priority(b) - priority(a));
    if (this.pending.length + Number(Boolean(this.active)) > 100) this.pending.pop();
  }

  current(now: number): AgentEvent | null {
    if (this.paused) return null;
    if (this.active && now >= this.active.until) this.active = null;
    if (!this.active) {
      const event = this.pending.shift();
      if (event) this.active = { event, until: now + 8000 };
    }
    return this.active ? { ...this.active.event } : null;
  }

  dismiss(_now: number): void { this.active = null; }
  setPaused(paused: boolean): void { this.paused = paused; }
}

function priority(event: AgentEvent): number {
  return ({ waiting: 4, failed: 3, ended: 2, interrupted: 2, working: 1, tool: 1, idle: 0, unknown: 0 })[event.kind];
}
