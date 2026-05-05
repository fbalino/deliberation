/**
 * Per-call HTTP timeouts and stream idle-chunk watchdog.
 * Without this, a single stalled provider stream can hang the engine forever
 * — which is exactly what happened during the 2026-05-05 parallel-run incident.
 *
 * Three timers cover the failure modes:
 *   - connectMs: model never returns headers (DNS/TLS/queueing stall)
 *   - idleMs:    headers arrived but the stream stops producing chunks
 *   - totalMs:   hard wall on a single call (catches slow drips)
 */

export interface CallTimeouts {
  /** Max time from request start until response headers arrive. */
  connectMs: number;
  /** Max time between two streamed chunks once the stream is open. */
  idleMs: number;
  /** Hard wall on the total call duration. */
  totalMs: number;
}

export const DEFAULT_TIMEOUTS: CallTimeouts = {
  connectMs: 60_000,
  idleMs: 90_000,
  totalMs: 5 * 60_000,
};

export class CallTimeoutError extends Error {
  readonly stage: 'connect' | 'idle' | 'total';
  readonly limitMs: number;
  /** Marker so the engine can classify this as transient (paused, not abandoned). */
  readonly transient = true;

  constructor(stage: 'connect' | 'idle' | 'total', limitMs: number) {
    super(`HTTP ${stage} timeout after ${limitMs}ms`);
    this.name = 'CallTimeoutError';
    this.stage = stage;
    this.limitMs = limitMs;
  }
}

export interface TimeoutController {
  signal: AbortSignal;
  /** Call after fetch resolves (response headers received). */
  onConnected(): void;
  /** Call after each stream chunk. */
  onChunk(): void;
  /** Always call in a finally block. */
  cleanup(): void;
}

export function createTimeoutController(
  timeouts: Partial<CallTimeouts> = {}
): TimeoutController {
  const t: CallTimeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const ctl = new AbortController();

  const abortWith = (err: CallTimeoutError) => {
    // AbortSignal.reason carries the typed error so callers can rethrow it.
    ctl.abort(err);
  };

  const totalTimer = setTimeout(
    () => abortWith(new CallTimeoutError('total', t.totalMs)),
    t.totalMs
  );
  let connectTimer: ReturnType<typeof setTimeout> | null = setTimeout(
    () => abortWith(new CallTimeoutError('connect', t.connectMs)),
    t.connectMs
  );
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    signal: ctl.signal,
    onConnected() {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    },
    onChunk() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => abortWith(new CallTimeoutError('idle', t.idleMs)),
        t.idleMs
      );
    },
    cleanup() {
      clearTimeout(totalTimer);
      if (connectTimer) clearTimeout(connectTimer);
      if (idleTimer) clearTimeout(idleTimer);
    },
  };
}

/**
 * Convert a fetch AbortError into the underlying CallTimeoutError if the
 * signal was aborted by one of our timers. Otherwise rethrow as-is.
 */
export function rethrowAbort(err: unknown, signal: AbortSignal): never {
  if (
    err instanceof DOMException && err.name === 'AbortError' &&
    signal.reason instanceof CallTimeoutError
  ) {
    throw signal.reason;
  }
  if (err instanceof Error && err.name === 'AbortError' &&
      signal.reason instanceof CallTimeoutError) {
    throw signal.reason;
  }
  throw err;
}
