import { insertCostLog, incrementSessionCost, getSessionCost as dbGetSessionCost } from '@/lib/db/queries';
import type { Phase, TokenUsage } from '@/lib/db/types';

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
