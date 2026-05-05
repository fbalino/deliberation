import { listRounds, listContributionsForRounds, insertRound, insertContribution, getSession } from '@/lib/db/queries';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent, TokenUsage } from '@/lib/db/types';
import { callModelStream } from '@/lib/openrouter/client';
import { assertWithinBudget, logCost } from '@/lib/costs/tracker';
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
  const analysisRounds = await listRounds(sessionId, ['analysis']);
  const analysisRoundIds = analysisRounds.map((r) => r.id);
  const analysisContribs = await listContributionsForRounds(analysisRoundIds);

  const analysesText = analysisContribs
    .map((c) => `[${c.panelist_display_name || 'Unknown'}]:\n${c.content}`)
    .join('\n\n---\n\n');

  let discussionTranscript = '';
  const aiPanelists = panelists.filter((p) => !p.is_human);
  const capCents = config.cost_cap_cents;

  // ---- Resume support ----
  // Replay completed discussion rounds for the UI and rebuild the transcript
  // so model prompts contain prior context. Skip those rounds; start the loop
  // at the first round that doesn't have all panelists.
  const existingDiscussionRounds = await listRounds(sessionId, ['discussion']);
  let resumeFromRound = 1;
  if (existingDiscussionRounds.length > 0) {
    const allDiscussionContribs = await listContributionsForRounds(
      existingDiscussionRounds.map((r) => r.id)
    );
    const byRound = new Map<string, typeof allDiscussionContribs>();
    for (const c of allDiscussionContribs) {
      const arr = byRound.get(c.round_id) || [];
      arr.push(c);
      byRound.set(c.round_id, arr);
    }

    for (const round of existingDiscussionRounds) {
      const contribs = byRound.get(round.id) || [];
      const completed = new Set(contribs.map((c) => c.panelist_id));
      const allDone = aiPanelists.every((p) => completed.has(p.id));
      if (!allDone) {
        // First incomplete round — resume from here. Don't replay it; the
        // loop below will create a fresh round_number for the rerun.
        break;
      }
      // Round is complete: replay events for the UI and rebuild transcript.
      emit({ type: 'round_start', round: round.round_number, phase: 'discussion' });
      discussionTranscript += `\n--- Round ${round.round_number} ---\n`;
      for (const c of contribs) {
        const p = panelists.find((pp) => pp.id === c.panelist_id);
        emit({ type: 'contribution_start', panelistId: c.panelist_id, panelistName: p?.display_name || 'Unknown' });
        emit({ type: 'contribution_chunk', panelistId: c.panelist_id, text: c.content, isThinking: false });
        emit({
          type: 'contribution_end',
          panelistId: c.panelist_id,
          tokenUsage: c.token_usage || {
            input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0,
          },
        });
        discussionTranscript += `[${p?.display_name || 'Unknown'}]:\n${c.content}\n\n`;
      }
      resumeFromRound = round.round_number + 1;
    }
  }

  for (let roundNum = resumeFromRound; roundNum <= config.suggested_rounds; roundNum++) {
    // Hard cost guard — fail before the next round begins, not after.
    await assertWithinBudget(sessionId, capCents);
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

    // Kill switch: check if session was abandoned between rounds
    const currentSession = await getSession(sessionId);
    if (currentSession?.status === 'abandoned') break;

    if (roundNum > config.hard_round_cap) break;

    const round = await insertRound(sessionId, 'discussion', roundNum);

    emit({ type: 'round_start', round: roundNum, phase: 'discussion' });

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

    const roundContributions: { name: string; content: string }[] = [];
    let consensusCount = 0;

    // Hybrid mode: round 1 simultaneous, round 2+ sequential
    const useSequential = config.turn_order === 'sequential'
      || (config.turn_order === 'hybrid' && roundNum > 1);

    if (useSequential) {
      // ---- SEQUENTIAL MODE ----
      // Each panelist responds one at a time, seeing all previous speakers in this round
      let currentRoundTranscript = '';

      for (const panelist of aiPanelists) {
        // Re-check before each sequential speaker — early panelists may have
        // already pushed us past the cap.
        await assertWithinBudget(sessionId, capCents);
        emit({ type: 'contribution_start', panelistId: panelist.id, panelistName: panelist.display_name });

        // Build prompt with previous speakers' responses from THIS round included
        const { system, user } = discussionPrompt({
          briefing: session.briefing_text || '',
          analyses: analysesText,
          discussionTranscript: discussionTranscript + (currentRoundTranscript ? `\n--- Round ${roundNum} (in progress) ---\n${currentRoundTranscript}` : ''),
          roundNumber: roundNum,
          panelistName: panelist.display_name,
          nudge: interventions.nudge || undefined,
          panelistSystemPrompt: panelist.system_prompt || undefined,
        });

        const result = await callAndStream(panelist, system, user, emit);

        // Consensus detection
        const consensus = detectConsensus(result.content);
        if (consensus.consensusSignal) {
          consensusCount++;
          emit({ type: 'consensus_signal', panelistId: panelist.id });
        }
        if (consensus.extensionRequest && consensus.extensionReason) {
          emit({ type: 'extension_request', panelistId: panelist.id, reason: consensus.extensionReason });
        }

        // Store contribution
        await insertContribution({
          round_id: round.id,
          panelist_id: panelist.id,
          content: result.content,
          thinking_content: result.thinkingContent || null,
          token_usage: result.usage,
          cost_cents: result.usage.cost_cents,
        });

        await logCost({
          sessionId,
          panelistId: panelist.id,
          phase: 'discussion',
          roundNumber: roundNum,
          modelId: panelist.model_id,
          usage: result.usage,
        });

        // Add to this round's running transcript so next speaker sees it
        currentRoundTranscript += `[${panelist.display_name}]:\n${result.content}\n\n`;
        roundContributions.push({ name: panelist.display_name, content: result.content });
      }
    } else {
      // ---- SIMULTANEOUS MODE ----
      // All panelists respond at the same time, can't see each other mid-round
      await Promise.all(
        aiPanelists.map(async (panelist) => {
          await assertWithinBudget(sessionId, capCents);
          emit({ type: 'contribution_start', panelistId: panelist.id, panelistName: panelist.display_name });

          const { system, user } = discussionPrompt({
            briefing: session.briefing_text || '',
            analyses: analysesText,
            discussionTranscript,
            roundNumber: roundNum,
            panelistName: panelist.display_name,
            nudge: interventions.nudge || undefined,
            panelistSystemPrompt: panelist.system_prompt || undefined,
          });

          const result = await callAndStream(panelist, system, user, emit);

          const consensus = detectConsensus(result.content);
          if (consensus.consensusSignal) {
            consensusCount++;
            emit({ type: 'consensus_signal', panelistId: panelist.id });
          }
          if (consensus.extensionRequest && consensus.extensionReason) {
            emit({ type: 'extension_request', panelistId: panelist.id, reason: consensus.extensionReason });
          }

          await insertContribution({
            round_id: round.id,
            panelist_id: panelist.id,
            content: result.content,
            thinking_content: result.thinkingContent || null,
            token_usage: result.usage,
            cost_cents: result.usage.cost_cents,
          });

          await logCost({
            sessionId,
            panelistId: panelist.id,
            phase: 'discussion',
            roundNumber: roundNum,
            modelId: panelist.model_id,
            usage: result.usage,
          });

          roundContributions.push({ name: panelist.display_name, content: result.content });
        })
      );
    }

    // Update running transcript
    discussionTranscript += `\n--- Round ${roundNum} ---\n`;
    for (const c of roundContributions) {
      discussionTranscript += `[${c.name}]:\n${c.content}\n\n`;
    }

    if (consensusCount > aiPanelists.length / 2) {
      emit({ type: 'intervention_prompt', message: 'Majority consensus reached — advancing to drafting' });
      break;
    }
  }
}

/** Stream a model call, accumulate content, emit chunks, return result */
async function callAndStream(
  panelist: DbPanelist,
  system: string,
  user: string,
  emit: (event: SSEEvent) => void
): Promise<{ content: string; thinkingContent: string; usage: TokenUsage }> {
  let content = '';
  let thinkingContent = '';
  let usage: TokenUsage = { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0 };

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
  return { content, thinkingContent, usage };
}
