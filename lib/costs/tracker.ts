import { supabaseServer } from '@/lib/supabase/server';
import type { Phase, TokenUsage } from '@/lib/supabase/types';

export async function logCost(params: {
  sessionId: string;
  panelistId: string;
  phase: Phase;
  roundNumber: number;
  modelId: string;
  usage: TokenUsage;
}): Promise<void> {
  await supabaseServer.from('cost_log').insert({
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

  await updateSessionTotalCost(params.sessionId, params.usage.cost_cents);
}

export async function updateSessionTotalCost(
  sessionId: string,
  additionalCents: number
): Promise<void> {
  const { data } = await supabaseServer
    .from('sessions')
    .select('total_cost_cents')
    .eq('id', sessionId)
    .single();

  if (data) {
    await supabaseServer
      .from('sessions')
      .update({ total_cost_cents: data.total_cost_cents + additionalCents })
      .eq('id', sessionId);
  }
}

export async function getSessionCost(sessionId: string): Promise<number> {
  const { data } = await supabaseServer
    .from('sessions')
    .select('total_cost_cents')
    .eq('id', sessionId)
    .single();

  return data?.total_cost_cents ?? 0;
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
