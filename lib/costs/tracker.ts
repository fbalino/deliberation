import { insertCostLog, incrementSessionCost, getSessionCost as dbGetSessionCost } from '@/lib/db/queries';
import type { Phase, TokenUsage } from '@/lib/db/types';

/**
 * Thrown when a session has reached or exceeded its cost cap.
 * The engine treats this as a graceful stop (the session is paused, not abandoned),
 * preserving all work already paid for.
 */
export class BudgetExceededError extends Error {
  readonly currentCostCents: number;
  readonly capCents: number;

  constructor(currentCostCents: number, capCents: number) {
    super(
      `Cost cap reached: $${(currentCostCents / 100).toFixed(2)} >= $${(capCents / 100).toFixed(2)}`
    );
    this.name = 'BudgetExceededError';
    this.currentCostCents = currentCostCents;
    this.capCents = capCents;
  }
}

export async function logCost(params: {
  sessionId: string;
  panelistId: string;
  phase: Phase;
  roundNumber: number;
  modelId: string;
  usage: TokenUsage;
}): Promise<void> {
  await insertCostLog({
    session_id: params.sessionId,
    panelist_id: params.panelistId,
    phase: params.phase,
    round_number: params.roundNumber,
    model_id: params.modelId,
    input_tokens: params.usage.input_tokens,
    output_tokens: params.usage.output_tokens,
    thinking_tokens: params.usage.thinking_tokens,
    cached_tokens: params.usage.cached_tokens,
    cost_cents: params.usage.cost_cents,
  });

  await incrementSessionCost(params.sessionId, params.usage.cost_cents);
}

export async function getSessionCost(sessionId: string): Promise<number> {
  return dbGetSessionCost(sessionId);
}

export async function checkCostCap(
  sessionId: string,
  capCents: number
): Promise<{ withinBudget: boolean; currentCostCents: number; remainingCents: number }> {
  const currentCostCents = await getSessionCost(sessionId);
  return {
    withinBudget: currentCostCents < capCents,
    currentCostCents,
    remainingCents: Math.max(0, capCents - currentCostCents),
  };
}

/**
 * Hard guard called before every model call. If the session has spent the
 * cap, throw BudgetExceededError so the engine stops cleanly *before* the
 * next call begins — not after another expensive round.
 */
export async function assertWithinBudget(sessionId: string, capCents: number): Promise<void> {
  const current = await getSessionCost(sessionId);
  if (current >= capCents) {
    throw new BudgetExceededError(current, capCents);
  }
}
