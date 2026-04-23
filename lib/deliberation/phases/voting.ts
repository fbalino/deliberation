import {
  getResolution, insertRound, insertContribution,
  markResolutionApproved, updateResolution, insertResolution,
} from '@/lib/db/queries';
import type {
  DbPanelist, DbSession, SessionConfig, SSEEvent, VoteData, VoteVerdict, ApprovalThreshold,
} from '@/lib/db/types';
import { callModelComplete } from '@/lib/openrouter/client';
import { logCost } from '@/lib/costs/tracker';
import { votingPrompt, draftingPrompt } from '@/lib/deliberation/prompts';

function tallyVotes(votes: VoteData[], threshold: ApprovalThreshold, panelistCount: number, customRatio?: { required: number; total: number }): boolean {
  const approvals = votes.filter(
    (v) => v.verdict === 'approve' || v.verdict === 'approve_with_amendments'
  ).length;

  switch (threshold) {
    case 'simple_majority':
      return approvals > panelistCount / 2;
    case 'supermajority':
      return approvals >= Math.ceil((panelistCount * 2) / 3);
    case 'unanimous':
      return approvals === panelistCount;
    case 'custom':
      if (customRatio) return approvals >= customRatio.required;
      return approvals > panelistCount / 2;
    default:
      return approvals > panelistCount / 2;
  }
}

function parseVoteResponse(content: string): VoteData {
  // Try JSON parse
  try {
    const parsed = JSON.parse(content.trim());
    return {
      verdict: parsed.verdict as VoteVerdict,
      amendments: parsed.amendments || null,
      reasoning: parsed.reasoning || '',
    };
  } catch {
    // Regex fallback
  }

  // Try extracting from partial JSON
  const verdictMatch = content.match(/"verdict"\s*:\s*"(approve(?:_with_amendments)?|reject)"/);
  const amendmentsMatch = content.match(/"amendments"\s*:\s*"([^"]*)"/);
  const reasoningMatch = content.match(/"reasoning"\s*:\s*"([^"]*)"/);

  if (verdictMatch) {
    return {
      verdict: verdictMatch[1] as VoteVerdict,
      amendments: amendmentsMatch?.[1] || null,
      reasoning: reasoningMatch?.[1] || content,
    };
  }

  // Keyword fallback
  const lower = content.toLowerCase();
  if (lower.includes('reject')) {
    return { verdict: 'reject', amendments: null, reasoning: content };
  }
  if (lower.includes('amend') || lower.includes('change') || lower.includes('modify')) {
    return { verdict: 'approve_with_amendments', amendments: content, reasoning: content };
  }
  return { verdict: 'approve', amendments: null, reasoning: content };
}

export async function runVotingPhase(
  sessionId: string,
  resolutionId: string,
  drafterId: string,
  panelists: DbPanelist[],
  session: DbSession,
  config: SessionConfig,
  emit: (event: SSEEvent) => void
): Promise<string> {
  const aiPanelists = panelists.filter((p) => !p.is_human);
  let currentResolutionId = resolutionId;

  for (let iteration = 1; iteration <= config.max_draft_iterations; iteration++) {
    // Load current draft
    const resolution = await getResolution(currentResolutionId);
    if (!resolution) throw new Error('Resolution not found');

    // Create voting round
    const round = await insertRound(sessionId, 'voting', iteration);

    emit({ type: 'round_start', round: iteration, phase: 'voting' });

    // Collect votes
    const allVotes: VoteData[] = [];
    const allAmendments: string[] = [];
    const dissents: { name: string; reasoning: string }[] = [];

    await Promise.all(
      aiPanelists.map(async (panelist) => {
        emit({ type: 'contribution_start', panelistId: panelist.id, panelistName: panelist.display_name });

        const { system, user } = votingPrompt({
          briefing: session.briefing_text || '',
          analyses: '',
          discussionTranscript: '',
          draftContent: resolution.content_markdown,
          panelistName: panelist.display_name,
        });

        try {
          const response = await callModelComplete({
            modelId: panelist.model_id,
            messages: [{ role: 'user', content: user }],
            systemPrompt: system,
            stream: false,
          });

          const voteData = parseVoteResponse(response.content);
          allVotes.push(voteData);

          if (voteData.amendments) {
            allAmendments.push(`[${panelist.display_name}]: ${voteData.amendments}`);
          }
          if (voteData.verdict === 'reject') {
            dissents.push({ name: panelist.display_name, reasoning: voteData.reasoning });
          }

          emit({
            type: 'vote_result',
            panelistId: panelist.id,
            verdict: voteData.verdict,
            reasoning: voteData.reasoning,
          });
          emit({ type: 'contribution_end', panelistId: panelist.id, tokenUsage: response.usage });

          // Store contribution with vote data
          await insertContribution({
            round_id: round.id,
            panelist_id: panelist.id,
            content: response.content,
            thinking_content: response.reasoning,
            token_usage: response.usage,
            cost_cents: response.usage.cost_cents,
            vote_data: voteData,
          });

          await logCost({
            sessionId,
            panelistId: panelist.id,
            phase: 'voting',
            roundNumber: iteration,
            modelId: panelist.model_id,
            usage: response.usage,
          });
        } catch (error) {
          // Default to approve on error
          const fallbackVote: VoteData = {
            verdict: 'approve',
            amendments: null,
            reasoning: `[Vote unavailable: ${error instanceof Error ? error.message : 'unknown error'}]`,
          };
          allVotes.push(fallbackVote);

          emit({
            type: 'vote_result',
            panelistId: panelist.id,
            verdict: 'approve',
            reasoning: fallbackVote.reasoning,
          });
          emit({
            type: 'contribution_end',
            panelistId: panelist.id,
            tokenUsage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0 },
          });

          await insertContribution({
            round_id: round.id,
            panelist_id: panelist.id,
            content: fallbackVote.reasoning,
            vote_data: fallbackVote,
          });
        }
      })
    );

    // Tally votes
    const approved = tallyVotes(allVotes, config.approval_threshold, aiPanelists.length, config.custom_threshold_ratio);

    if (approved) {
      await markResolutionApproved(currentResolutionId);
      return currentResolutionId;
    }

    // Minority report mode: force-approve immediately with dissents
    if (config.disagreement_handling === 'minority_report') {
      let finalMarkdown = resolution.content_markdown;
      if (dissents.length > 0) {
        finalMarkdown += '\n\n---\n\n## Dissenting Opinions\n\n';
        for (const d of dissents) {
          finalMarkdown += `### ${d.name}\n${d.reasoning}\n\n`;
        }
      }
      await updateResolution(currentResolutionId, { content_markdown: finalMarkdown, status: 'approved' });
      emit({ type: 'intervention_prompt', message: 'Resolution approved with minority report (dissenting opinions appended)' });
      return currentResolutionId;
    }

    // Not approved — check if this is the last iteration
    if (iteration >= config.max_draft_iterations) {
      // Force-approve, append dissents only if disagreement_handling includes minority_report
      let finalMarkdown = resolution.content_markdown;

      if (config.disagreement_handling === 'both' && dissents.length > 0) {
        finalMarkdown += '\n\n---\n\n## Dissenting Opinions\n\n';
        for (const d of dissents) {
          finalMarkdown += `### ${d.name}\n${d.reasoning}\n\n`;
        }
      }

      await updateResolution(currentResolutionId, { content_markdown: finalMarkdown, status: 'approved' });

      emit({ type: 'intervention_prompt', message: 'Maximum draft iterations reached — resolution force-approved' });
      return currentResolutionId;
    }

    // Send amendments back to drafter for revision
    emit({ type: 'intervention_prompt', message: `Draft rejected — revision ${iteration + 1} requested` });

    const drafter = panelists.find((p) => p.id === drafterId)!;
    const amendmentText = allAmendments.join('\n\n');

    // Create new drafting round
    const draftRound = await insertRound(sessionId, 'drafting', iteration + 1);

    emit({ type: 'round_start', round: iteration + 1, phase: 'drafting' });
    emit({ type: 'contribution_start', panelistId: drafter.id, panelistName: drafter.display_name });

    const { system: draftSystem, user: draftUser } = draftingPrompt({
      briefing: session.briefing_text || '',
      analyses: '',
      discussionTranscript: `Previous draft:\n${resolution.content_markdown}\n\nAmendments requested:\n${amendmentText}`,
      panelistName: drafter.display_name,
    });

    try {
      const response = await callModelComplete({
        modelId: drafter.model_id,
        messages: [{ role: 'user', content: draftUser }],
        systemPrompt: draftSystem,
        stream: false,
      });

      emit({ type: 'contribution_end', panelistId: drafter.id, tokenUsage: response.usage });

      // Store contribution
      await insertContribution({
        round_id: draftRound.id,
        panelist_id: drafter.id,
        content: response.content,
        thinking_content: response.reasoning,
        token_usage: response.usage,
        cost_cents: response.usage.cost_cents,
      });

      // Create new resolution version
      const newResolution = await insertResolution({
        session_id: sessionId,
        version: iteration + 1,
        drafter_panelist_id: drafter.id,
        draft_type: 'elected',
        content_markdown: response.content,
        status: 'draft',
      });

      currentResolutionId = newResolution.id;

      await logCost({
        sessionId,
        panelistId: drafter.id,
        phase: 'drafting',
        roundNumber: iteration + 1,
        modelId: drafter.model_id,
        usage: response.usage,
      });
    } catch (error) {
      // If re-drafting fails, force-approve current version
      await markResolutionApproved(currentResolutionId);

      emit({ type: 'error', message: `Re-drafting failed: ${error instanceof Error ? error.message : 'unknown'}`, fatal: false });
      return currentResolutionId;
    }
  }

  return currentResolutionId;
}
