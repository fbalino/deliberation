import { listRounds, listContributionsForRounds, insertRound, insertContribution, insertResolution } from '@/lib/db/queries';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent, TokenUsage } from '@/lib/db/types';
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
  const rounds = await listRounds(sessionId, ['analysis', 'discussion']);
  const roundIds = rounds.map((r) => r.id);
  const allContribs = await listContributionsForRounds(roundIds);

  // Build analyses and discussion strings
  const analysisRoundIds = rounds.filter((r) => r.phase === 'analysis').map((r) => r.id);
  const discussionRoundIds = rounds.filter((r) => r.phase === 'discussion').map((r) => r.id);

  const analysesText = allContribs
    .filter((c) => analysisRoundIds.includes(c.round_id))
    .map((c) => `[${c.panelist_display_name || 'Unknown'}]:\n${c.content}`)
    .join('\n\n---\n\n');

  const discussionText = allContribs
    .filter((c) => discussionRoundIds.includes(c.round_id))
    .map((c) => `[${c.panelist_display_name || 'Unknown'}]:\n${c.content}`)
    .join('\n\n');

  // Create drafting round
  const round = await insertRound(sessionId, 'drafting', 1);

  emit({ type: 'round_start', round: 1, phase: 'drafting' });
  emit({ type: 'contribution_start', panelistId: drafter.id, panelistName: drafter.display_name });

  const { system, user } = draftingPrompt({
    briefing: session.briefing_text || '',
    analyses: analysesText,
    discussionTranscript: discussionText,
    panelistName: drafter.display_name,
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
  await insertContribution({
    round_id: round.id,
    panelist_id: drafter.id,
    content,
    thinking_content: thinkingContent || null,
    token_usage: usage,
    cost_cents: usage.cost_cents,
  });

  // Create resolution
  const resolution = await insertResolution({
    session_id: sessionId,
    version: 1,
    drafter_panelist_id: drafter.id,
    draft_type: 'elected',
    content_markdown: content,
    status: 'draft',
  });

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
