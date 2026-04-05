import { supabaseServer } from '@/lib/supabase/server';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent, TokenUsage } from '@/lib/supabase/types';
import { callModelStream } from '@/lib/openrouter/client';
import { logCost } from '@/lib/costs/tracker';
import { analysisPrompt } from '@/lib/deliberation/prompts';

export async function runAnalysisPhase(
  sessionId: string,
  panelists: DbPanelist[],
  session: DbSession,
  config: SessionConfig,
  emit: (event: SSEEvent) => void
): Promise<void> {
  // Create round
  const { data: round } = await supabaseServer
    .from('rounds')
    .insert({ session_id: sessionId, phase: 'analysis', round_number: 1 })
    .select()
    .single();

  if (!round) throw new Error('Failed to create analysis round');

  emit({ type: 'round_start', round: 1, phase: 'analysis' });

  const aiPanelists = panelists.filter((p) => !p.is_human);

  if (config.analysis_mode === 'open') {
    // Open mode: sequential — each panelist sees previous analyses
    let previousAnalyses = '';

    for (const panelist of aiPanelists) {
      const content = await analyzeWithPanelist(panelist, session, round.id, sessionId, emit, previousAnalyses || undefined);
      previousAnalyses += `[${panelist.display_name}]:\n${content}\n\n---\n\n`;
    }
  } else {
    // Blind mode: parallel — panelists don't see each other
    await Promise.all(
      aiPanelists.map((panelist) =>
        analyzeWithPanelist(panelist, session, round.id, sessionId, emit)
      )
    );
  }
}

async function analyzeWithPanelist(
  panelist: DbPanelist,
  session: DbSession,
  roundId: string,
  sessionId: string,
  emit: (event: SSEEvent) => void,
  previousAnalyses?: string
): Promise<string> {
  emit({ type: 'contribution_start', panelistId: panelist.id, panelistName: panelist.display_name });

  const { system, user } = analysisPrompt({
    briefing: session.briefing_text || '',
    panelistSystemPrompt: panelist.system_prompt || undefined,
    previousAnalyses,
  });

  let content = '';
  let thinkingContent = '';
  let usage: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cached_tokens: 0,
    cost_cents: 0,
  };

  try {
    const stream = callModelStream({
      modelId: panelist.model_id,
      messages: [{ role: 'user', content: user }],
      systemPrompt: system,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        content += chunk.text;
        emit({ type: 'contribution_chunk', panelistId: panelist.id, text: chunk.text, isThinking: false });
      } else if (chunk.type === 'reasoning') {
        thinkingContent += chunk.text;
        emit({ type: 'contribution_chunk', panelistId: panelist.id, text: chunk.text, isThinking: true });
      } else if (chunk.type === 'done') {
        usage = chunk.usage;
      }
    }
  } catch (error) {
    content = content || `[Analysis unavailable: ${error instanceof Error ? error.message : 'unknown error'}]`;
  }

  emit({ type: 'contribution_end', panelistId: panelist.id, tokenUsage: usage });

  // Store contribution
  await supabaseServer.from('contributions').insert({
    round_id: roundId,
    panelist_id: panelist.id,
    content,
    thinking_content: thinkingContent || null,
    token_usage: usage,
    cost_cents: usage.cost_cents,
  });

  // Log cost
  await logCost({
    sessionId,
    panelistId: panelist.id,
    phase: 'analysis',
    roundNumber: 1,
    modelId: panelist.model_id,
    usage,
  });

  return content;
}
