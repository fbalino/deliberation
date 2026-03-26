import { supabaseServer } from '@/lib/supabase/server';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent, TokenUsage } from '@/lib/supabase/types';
import { callModelStream } from '@/lib/openrouter/client';
import { logCost } from '@/lib/costs/tracker';
import { discussionPrompt } from '@/lib/deliberation/prompts';
import { detectConsensus } from '@/lib/deliberation/consensus';
import { contextManager } from '@/lib/deliberation/context-manager';

export async function runDiscussionPhase(
  sessionId: string,
  panelists: DbPanelist[],
  session: DbSession,
  config: SessionConfig,
  emit: (event: SSEEvent) => void,
  checkInterventions: () => Promise<{ pause: boolean; forceAdvance: boolean; nudge: string | null }>,
  waitForResume: () => Promise<void>
): Promise<void> {
  // Load analyses from the analysis round
  const { data: analysisRound } = await supabaseServer
    .from('rounds')
    .select('id')
    .eq('session_id', sessionId)
    .eq('phase', 'analysis')
    .single();

  const { data: analysisContribs } = await supabaseServer
    .from('contributions')
    .select('*, panelists!inner(display_name)')
    .eq('round_id', analysisRound?.id || '');

  const analysesText = (analysisContribs || [])
    .map((c) => {
      const name = (c as Record<string, unknown>).panelists as { display_name: string } | undefined;
      return `[${name?.display_name || 'Unknown'}]:\n${c.content}`;
    })
    .join('\n\n---\n\n');

  let discussionTranscript = '';
  const aiPanelists = panelists.filter((p) => !p.is_human);

  for (let roundNum = 1; roundNum <= config.suggested_rounds; roundNum++) {
    // Check for interventions
    const interventions = await checkInterventions();

    if (interventions.forceAdvance) {
      emit({ type: 'intervention_prompt', message: 'Force advance: skipping remaining discussion rounds' });
      break;
    }

    if (interventions.pause) {
      emit({ type: 'intervention_prompt', message: 'Discussion paused by user' });
      await waitForResume();
      emit({ type: 'intervention_prompt', message: 'Discussion resumed' });
    }

    // Check hard cap
    if (roundNum > config.hard_round_cap) break;

    // Create round
    const { data: round } = await supabaseServer
      .from('rounds')
      .insert({ session_id: sessionId, phase: 'discussion', round_number: roundNum })
      .select()
      .single();

    if (!round) throw new Error(`Failed to create discussion round ${roundNum}`);

    emit({ type: 'round_start', round: roundNum, phase: 'discussion' });

    // Fit content to context window for the first panelist's model (use smallest window)
    const fitted = contextManager.fitToContext({
      systemPrompt: '',
      briefing: session.briefing_text || '',
      analyses: analysesText,
      discussion: discussionTranscript,
      modelId: aiPanelists[0]?.model_id || '',
    });

    if (fitted.wasTruncated) {
      emit({ type: 'intervention_prompt', message: 'Context was truncated to fit model limits' });
    }

    // Fan out simultaneous calls
    const roundContributions: { name: string; content: string }[] = [];
    let consensusCount = 0;

    await Promise.all(
      aiPanelists.map(async (panelist) => {
        emit({ type: 'contribution_start', panelistId: panelist.id, panelistName: panelist.display_name });

        const { system, user } = discussionPrompt({
          briefing: session.briefing_text || '',
          analyses: analysesText,
          discussionTranscript,
          roundNumber: roundNum,
          nudge: interventions.nudge || undefined,
          panelistSystemPrompt: panelist.system_prompt || undefined,
        });

        let content = '';
        let thinkingContent = '';
        let usage: TokenUsage = {
          input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0,
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
          content = content || `[Response unavailable: ${error instanceof Error ? error.message : 'unknown error'}]`;
        }

        emit({ type: 'contribution_end', panelistId: panelist.id, tokenUsage: usage });

        // Consensus detection
        const consensus = detectConsensus(content);
        if (consensus.consensusSignal) {
          consensusCount++;
          emit({ type: 'consensus_signal', panelistId: panelist.id });
        }
        if (consensus.extensionRequest && consensus.extensionReason) {
          emit({ type: 'extension_request', panelistId: panelist.id, reason: consensus.extensionReason });
        }

        // Store contribution
        await supabaseServer.from('contributions').insert({
          round_id: round.id,
          panelist_id: panelist.id,
          content,
          thinking_content: thinkingContent || null,
          token_usage: usage,
          cost_cents: usage.cost_cents,
        });

        await logCost({
          sessionId,
          panelistId: panelist.id,
          phase: 'discussion',
          roundNumber: roundNum,
          modelId: panelist.model_id,
          usage,
        });

        roundContributions.push({ name: panelist.display_name, content });
      })
    );

    // Update running transcript
    discussionTranscript += `\n--- Round ${roundNum} ---\n`;
    for (const c of roundContributions) {
      discussionTranscript += `[${c.name}]:\n${c.content}\n\n`;
    }

    // Early termination if majority signals consensus
    if (consensusCount > aiPanelists.length / 2) {
      emit({ type: 'intervention_prompt', message: 'Majority consensus reached — advancing to drafting' });
      break;
    }
  }
}
