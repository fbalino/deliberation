/**
 * Per-provider concurrency limiter.
 *
 * When 3 deliberation sessions run in parallel, each phase fans out to all
 * panelists at once (Promise.all in analysis/discussion/drafter-election/voting).
 * Worst case: 3 sessions × 3 panelists = 9 simultaneous calls per provider.
 * Preview models (e.g. gemini-3.1-pro-preview) have low rate limits and can
 * stall under that load — that's the failure mode that wasted ~$6.50 on
 * 2026-05-05.
 *
 * This limiter is process-global, not per-session: that's the level where
 * provider rate limits actually live.
 */

import type { Provider } from './types';

const DEFAULT_LIMITS: Record<Provider, number> = {
  anthropic: 3,
  openai: 3,
  // Gemini preview models tend to have the tightest rate limits.
  google: 2,
};

class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const semaphores: Record<Provider, Semaphore> = {
  anthropic: new Semaphore(DEFAULT_LIMITS.anthropic),
  openai: new Semaphore(DEFAULT_LIMITS.openai),
  google: new Semaphore(DEFAULT_LIMITS.google),
};

export async function withProviderSlot<T>(
  provider: Provider,
  fn: () => Promise<T>
): Promise<T> {
  const sem = semaphores[provider];
  await sem.acquire();
  try {
    return await fn();
  } finally {
    sem.release();
  }
}

export async function* withProviderSlotStream<T>(
  provider: Provider,
  fn: () => AsyncGenerator<T>
): AsyncGenerator<T> {
  const sem = semaphores[provider];
  await sem.acquire();
  try {
    yield* fn();
  } finally {
    sem.release();
  }
}
