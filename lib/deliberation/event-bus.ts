import type { SSEEvent } from '@/lib/supabase/types';

interface SessionBusState {
  isRunning: boolean;
  listeners: Set<(event: SSEEvent) => void>;
  replayBuffer: SSEEvent[];
}

const MAX_REPLAY_BUFFER = 1000;

class EventBus {
  private sessions = new Map<string, SessionBusState>();

  create(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        isRunning: false,
        listeners: new Set(),
        replayBuffer: [],
      });
    }
  }

  emit(sessionId: string, event: SSEEvent): void {
    const bus = this.sessions.get(sessionId);
    if (!bus) return;

    bus.replayBuffer.push(event);
    if (bus.replayBuffer.length > MAX_REPLAY_BUFFER) {
      bus.replayBuffer.shift();
    }

    for (const listener of bus.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors should not break the engine
      }
    }
  }

  subscribe(sessionId: string, callback: (event: SSEEvent) => void): () => void {
    const bus = this.sessions.get(sessionId);
    if (!bus) {
      this.create(sessionId);
      return this.subscribe(sessionId, callback);
    }

    bus.listeners.add(callback);
    return () => {
      bus.listeners.delete(callback);
    };
  }

  isRunning(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isRunning ?? false;
  }

  setRunning(sessionId: string, running: boolean): void {
    const bus = this.sessions.get(sessionId);
    if (bus) bus.isRunning = running;
  }

  getReplayBuffer(sessionId: string): SSEEvent[] {
    return this.sessions.get(sessionId)?.replayBuffer ?? [];
  }

  cleanup(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const sessionBus = new EventBus();
