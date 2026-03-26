import { supabaseServer } from '@/lib/supabase/server';
import type { DbPanelist, DbSession, SessionConfig, SSEEvent } from '@/lib/supabase/types';
import { callModelComplete } from '@/lib/openrouter/client';
import { logCost } from '@/lib/costs/tracker';
import { drafterElectionPrompt } from '@/lib/deliberation/prompts';

export async function runDrafterElection(
  sessionId: string,
  panelists: DbPanelist[],
  session: DbSession,
  config: SessionConfig,
  emit: (event: SSEEvent) => void
): Promise<string> {
  // If user pre-assigned a drafter, use that
  if (config.pre_assigned_drafter_id) {
    const drafter = panelists.find((p) => p.id === config.pre_assigned_drafter_id);
    if (drafter) {
      emit({ type: 'drafter_elected', panelistId: drafter.id, panelistName: drafter.display_name });
      return drafter.id;
    }
  }

  // Load discussion transcript for context
  const { data: rounds } = await supabaseServer
    .from('rounds')
    .select('id, phase')
    .eq('session_id', sessionId)
    .in('phase', ['analysis', 'discussion']);

  const roundIds = (rounds || []).map((r) => r.id);
  const { data: contribs } = await supabaseServer
    .from('contributions')
    .select('content')
    .in('round_id', roundIds);

  const transcript = (contribs || []).map((c) => c.content).join('\n---\n');

  // Create election round
  const { data: round } = await supabaseServer
    .from('rounds')
    .insert({ session_id: sessionId, phase: 'drafter_election', round_number: 1 })
    .select()
    .single();

  if (!round) throw new Error('Failed to create drafter election round');

  emit({ type: 'round_start', round: 1, phase: 'drafter_election' });

  const aiPanelists = panelists.filter((p) => !p.is_human);
  const panelistNames = aiPanelists.map((p) => p.display_name);

  const { system, user } = drafterElectionPrompt({
    briefing: session.briefing_text || '',
    analyses: transcript.slice(0, 2000),
    discussionTranscript: transcript.slice(2000, 4000),
    panelistNames,
  });

  // Collect votes
  const votes = new Map<string, number>();

  await Promise.all(
    aiPanelists.map(async (panelist) => {
      emit({ type: 'contribution_start', panelistId: panelist.id, panelistName: panelist.display_name });

      try {
        const response = await callModelComplete({
          modelId: panelist.model_id,
          messages: [{ role: 'user', content: user }],
          systemPrompt: system,
          stream: false,
        });

        // Parse the vote
        let pick: string | null = null;
        let reason = '';

        try {
          const parsed = JSON.parse(response.content.trim());
          pick = parsed.pick;
          reason = parsed.reason || '';
        } catch {
          // Try regex fallback
          const match = response.content.match(/"pick"\s*:\s*"([^"]+)"/);
          if (match) pick = match[1];
          reason = response.content;
        }

        // Find the panelist ID for the picked name
        const votedFor = pick ? aiPanelists.find(
          (p) => p.display_name.toLowerCase() === pick!.toLowerCase()
        ) : null;

        if (votedFor) {
          votes.set(votedFor.id, (votes.get(votedFor.id) || 0) + 1);
        }

        emit({ type: 'contribution_end', panelistId: panelist.id, tokenUsage: response.usage });

        // Store vote
        await supabaseServer.from('contributions').insert({
          round_id: round.id,
          panelist_id: panelist.id,
          content: response.content,
          thinking_content: response.reasoning,
          token_usage: response.usage,
          cost_cents: response.usage.cost_cents,
          drafter_vote: votedFor?.id || null,
        });

        await logCost({
          sessionId,
          panelistId: panelist.id,
          phase: 'drafter_election',
          roundNumber: 1,
          modelId: panelist.model_id,
          usage: response.usage,
        });
      } catch (error) {
        emit({
          type: 'contribution_end',
          panelistId: panelist.id,
          tokenUsage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0 },
        });

        await supabaseServer.from('contributions').insert({
          round_id: round.id,
          panelist_id: panelist.id,
          content: `[Vote unavailable: ${error instanceof Error ? error.message : 'unknown error'}]`,
          drafter_vote: null,
        });
      }
    })
  );

  // Tally votes — pick the winner, break ties by sort_order
  let winnerId = aiPanelists[0].id;
  let maxVotes = 0;

  for (const [panelistId, count] of votes) {
    if (count > maxVotes) {
      maxVotes = count;
      winnerId = panelistId;
    } else if (count === maxVotes) {
      // Break tie by sort_order
      const current = aiPanelists.find((p) => p.id === winnerId);
      const challenger = aiPanelists.find((p) => p.id === panelistId);
      if (challenger && current && challenger.sort_order < current.sort_order) {
        winnerId = panelistId;
      }
    }
  }

  const winner = aiPanelists.find((p) => p.id === winnerId)!;
  emit({ type: 'drafter_elected', panelistId: winner.id, panelistName: winner.display_name });

  return winnerId;
}
