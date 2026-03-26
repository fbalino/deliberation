import { supabaseServer } from '@/lib/supabase/server';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent, TokenUsage } from '@/lib/supabase/types';
import { callModelStream } from '@/lib/openrouter/client';
import { logCost } from '@/lib/costs/tracker';
import { draftingPrompt } from '@/lib/deliberation/prompts';

export async function runDraftingPhase(
  sessionId: string,
  drafterId: string,
  panelists: DbPanelist[],
  session: DbSession,
  _config: SessionConfig,
  emit: (event: SSEEvent) => void
): Promise<string> {
  const drafter = panelists.find((p) => p.id === drafterId);
  if (!drafter) throw new Error('Drafter not found');

  // Load full transcript
  const { data: rounds } = await supabaseServer
    .from('rounds')
    .select('id, phase, round_number')
    .eq('session_id', sessionId)
    .in('phase', ['analysis', 'discussion'])
    .order('round_number');

  const roundIds = (rounds || []).map((r) => r.id);
  const { data: allContribs } = await supabaseServer
    .from('contributions')
    .select('*, panelists!inner(display_name)')
    .in('round_id', roundIds)
    .order('created_at');

  // Build analyses and discussion strings
  const analysisRoundIds = (rounds || []).filter((r) => r.phase === 'analysis').map((r) => r.id);
  const discussionRoundIds = (rounds || []).filter((r) => r.phase === 'discussion').map((r) => r.id);

  const analysesText = (allContribs || [])
    .filter((c) => analysisRoundIds.includes(c.round_id))
    .map((c) => {
      const name = (c as Record<string, unknown>).panelists as { display_name: string } | undefined;
      return `[${name?.display_name || 'Unknown'}]:\n${c.content}`;
    })
    .join('\n\n---\n\n');

  const discussionText = (allContribs || [])
    .filter((c) => discussionRoundIds.includes(c.round_id))
    .map((c) => {
      const name = (c as Record<string, unknown>).panelists as { display_name: string } | undefined;
      return `[${name?.display_name || 'Unknown'}]:\n${c.content}`;
    })
    .join('\n\n');

  // Create drafting round
  const { data: round } = await supabaseServer
    .from('rounds')
    .insert({ session_id: sessionId, phase: 'drafting', round_number: 1 })
    .select()
    .single();

  if (!round) throw new Error('Failed to create drafting round');

  emit({ type: 'round_start', round: 1, phase: 'drafting' });
  emit({ type: 'contribution_start', panelistId: drafter.id, panelistName: drafter.display_name });

  const { system, user } = draftingPrompt({
    briefing: session.briefing_text || '',
    analyses: analysesText,
    discussionTranscript: discussionText,
  });

  let content = '';
  let thinkingContent = '';
  let usage: TokenUsage = {
    input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0,
  };

  try {
    const stream = callModelStream({
      modelId: drafter.model_id,
      messages: [{ role: 'user', content: user }],
      systemPrompt: system,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        content += chunk.text;
        emit({ type: 'contribution_chunk', panelistId: drafter.id, text: chunk.text, isThinking: false });
      } else if (chunk.type === 'reasoning') {
        thinkingContent += chunk.text;
        emit({ type: 'contribution_chunk', panelistId: drafter.id, text: chunk.text, isThinking: true });
      } else if (chunk.type === 'done') {
        usage = chunk.usage;
      }
    }
  } catch (error) {
    content = content || `[Draft unavailable: ${error instanceof Error ? error.message : 'unknown error'}]`;
  }

  emit({ type: 'contribution_end', panelistId: drafter.id, tokenUsage: usage });

  // Store contribution
  await supabaseServer.from('contributions').insert({
    round_id: round.id,
    panelist_id: drafter.id,
    content,
    thinking_content: thinkingContent || null,
    token_usage: usage,
    cost_cents: usage.cost_cents,
  });

  // Create resolution
  const { data: resolution } = await supabaseServer
    .from('resolutions')
    .insert({
      session_id: sessionId,
      version: 1,
      drafter_panelist_id: drafter.id,
      draft_type: 'elected',
      content_markdown: content,
      status: 'draft',
    })
    .select()
    .single();

  if (!resolution) throw new Error('Failed to create resolution');

  await logCost({
    sessionId,
    panelistId: drafter.id,
    phase: 'drafting',
    roundNumber: 1,
    modelId: drafter.model_id,
    usage,
  });

  return resolution.id;
}
