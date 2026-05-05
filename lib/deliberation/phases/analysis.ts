import {
  insertRound, insertContribution,
  listRounds, listContributionsForRound,
} from '@/lib/db/queries';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent, TokenUsage } from '@/lib/db/types';
import { callModelStream } from '@/lib/openrouter/client';
import { assertWithinBudget, logCost } from '@/lib/costs/tracker';
import { analysisPrompt } from '@/lib/deliberation/prompts';

export async function runAnalysisPhase(
  sessionId: string,
  panelists: DbPanelist[],
  session: DbSession,
  config: SessionConfig,
  emit: (event: SSEEvent) => void
): Promise<void> {
  const aiPanelists = panelists.filter((p) => !p.is_human);
  const capCents = config.cost_cap_cents;

  // ---- Resume support ----
  // If an analysis round already exists with all AI panelists having
  // contributions, we've done this phase before — replay it for the UI
  // and skip the (expensive) model calls.
  const existingRounds = await listRounds(sessionId, ['analysis']);
  if (existingRounds.length > 0) {
    const latest = existingRounds[existingRounds.length - 1];
    const contribs = await listContributionsForRound(latest.id);
    const completed = new Set(contribs.map((c) => c.panelist_id));
    const allDone = aiPanelists.every((p) => completed.has(p.id));
    if (allDone) {
      emit({ type: 'round_start', round: latest.round_number, phase: 'analysis' });
      for (const c of contribs) {
        const p = panelists.find((pp) => pp.id === c.panelist_id);
        emit({
          type: 'contribution_start',
          panelistId: c.panelist_id,
          panelistName: p?.display_name || 'Unknown',
        });
        emit({
          type: 'contribution_chunk',
          panelistId: c.panelist_id,
          text: c.content,
          isThinking: false,
        });
        emit({
          type: 'contribution_end',
          panelistId: c.panelist_id,
          tokenUsage: c.token_usage || {
            input_tokens: 0, output_tokens: 0, thinking_tokens: 0,
            cached_tokens: 0, cost_cents: 0,
          },
        });
      }
      return;
    }
    // Partial round — fall through and create a new round. We accept the
    // rework cost; the cost guard caps the damage.
  }

  // Create round
  const round = await insertRound(sessionId, 'analysis', 1);

  emit({ type: 'round_start', round: 1, phase: 'analysis' });

  if (config.analysis_mode === 'open') {
    // Open mode: sequential — each panelist sees previous analyses
    let previousAnalyses = '';

    for (const panelist of aiPanelists) {
      await assertWithinBudget(sessionId, capCents);
      const content = await analyzeWithPanelist(panelist, session, round.id, sessionId, emit, previousAnalyses || undefined);
      previousAnalyses += `[${panelist.display_name}]:\n${content}\n\n---\n\n`;
    }
  } else {
    // Blind mode: parallel — panelists don't see each other.
    // Each panelist re-checks the budget at the top of its async closure;
    // this gives a fast-fail if the cap was already breached before this phase.
    await assertWithinBudget(sessionId, capCents);
    await Promise.all(
      aiPanelists.map(async (panelist) => {
        await assertWithinBudget(sessionId, capCents);
        return analyzeWithPanelist(panelist, session, round.id, sessionId, emit);
      })
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
    panelistName: panelist.display_name,
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
  await insertContribution({
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
