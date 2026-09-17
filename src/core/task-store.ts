import type { AgentEvent, TaskState } from './types';
export class TaskStore {
  private states = new Map<string, TaskState>();
  private events: AgentEvent[] = [];
  private ids = new Set<string>();
  private turns = new Map<string, Set<string>>();

  apply(event: AgentEvent): boolean {
    if (this.ids.has(event.id)) return false;
    this.ids.add(event.id);
    if (this.ids.size > 1000) this.ids.delete(this.ids.values().next().value!);
    const key = `${event.provider}:${event.origin ? `${event.origin}:` : ''}${event.sessionId}`;
    const old = this.states.get(key);
    const known = this.turns.get(key) ?? new Set<string>();
    const startsTurn = event.startsTurn === true && event.kind === 'working';
    if (old) {
      if (event.receivedAt < old.updatedAt) return false;
      if (event.turnId && event.turnId !== old.turnId && known.has(event.turnId)) return false;
      const terminal = ['ended', 'interrupted', 'failed'].includes(old.status);
      const sameOrUnknownTurn = !event.turnId || event.turnId === old.turnId;
      if (terminal && sameOrUnknownTurn && ['working', 'tool', 'waiting'].includes(event.kind) && !(startsTurn && !event.turnId)) return false;
      // An uncorrelated completion must not terminate an explicitly identified active turn.
      if (old.turnId && !event.turnId && ['ended', 'interrupted', 'failed'].includes(event.kind)) return false;
    }
    if (event.turnId) known.add(event.turnId);
    if (known.size > 1000) known.delete(known.values().next().value!);
    this.turns.set(key, known);
    this.states.delete(key);
    this.states.set(key, {
      key, provider:event.provider, ...(event.origin ? {origin:event.origin} : {}), sessionId: event.sessionId, turnId: startsTurn ? event.turnId : event.turnId ?? old?.turnId,
      status: event.kind, summary: event.summary, updatedAt: event.receivedAt,
      ...(event.taskName ?? old?.taskName ? { taskName: event.taskName ?? old?.taskName } : {}),
    });
    if (this.states.size > 100) {
      const oldest = this.states.keys().next().value!;
      this.states.delete(oldest); this.turns.delete(oldest);
    }
    this.events.push({ ...event });
    if (this.events.length > 100) this.events.shift();
    return true;
  }

  tasks(): TaskState[] { return [...this.states.values()].reverse().map(task => ({ ...task })); }
  history(): AgentEvent[] { return this.events.map(event => ({ ...event })); }

  restore(history: AgentEvent[]): void {
    this.states.clear(); this.events = []; this.ids.clear(); this.turns.clear();
    for (const event of history.slice(-100)) this.apply(event);
    for (const state of this.states.values()) {
      state.status = 'unknown'; state.summary = '上次工作階段的狀態尚未確認，等待新事件';
    }
  }
}
