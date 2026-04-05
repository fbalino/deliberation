import { supabaseServer } from '@/lib/supabase/server';
import { sessionBus } from '@/lib/deliberation/event-bus';
import { runDraftingPhase } from '@/lib/deliberation/phases/drafting';
import { runVotingPhase } from '@/lib/deliberation/phases/voting';
import { checkCostCap } from '@/lib/costs/tracker';
import type { SSEEvent, DbSession, DbPanelist, SessionConfig, SessionStatus } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/sessions/[id]/redraft
 * SSE endpoint that re-runs just the drafting + voting phases for a completed/stuck session.
 * Uses the existing elected drafter and transcript — just produces a new draft and re-votes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* closed */ }
      }

      try {
        // Load session
        const { data: sessionRow } = await supabaseServer
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (!sessionRow) {
          send({ type: 'error', message: 'Session not found', fatal: true });
          controller.close();
          return;
        }

        const session = sessionRow as DbSession;
        const config = session.config as SessionConfig;

        // Load panelists
        const { data: panelistRows } = await supabaseServer
          .from('panelists')
          .select('*')
          .eq('session_id', sessionId)
          .order('sort_order');

        const panelists = (panelistRows || []) as DbPanelist[];

        // Find the elected drafter from existing contributions
        const { data: electionRounds } = await supabaseServer
          .from('rounds')
          .select('id')
          .eq('session_id', sessionId)
          .eq('phase', 'drafter_election');

        let drafterId: string | null = null;

        if (electionRounds?.length) {
          const { data: votes } = await supabaseServer
            .from('contributions')
            .select('drafter_vote')
            .in('round_id', electionRounds.map((r) => r.id))
            .not('drafter_vote', 'is', null);

          // Tally votes
          const tally = new Map<string, number>();
          for (const v of votes || []) {
            if (v.drafter_vote) tally.set(v.drafter_vote, (tally.get(v.drafter_vote) || 0) + 1);
          }
          let maxVotes = 0;
          for (const [id, count] of tally) {
            if (count > maxVotes) { drafterId = id; maxVotes = count; }
          }
        }

        // Fallback: check existing resolutions for the drafter
        if (!drafterId) {
          const { data: existingRes } = await supabaseServer
            .from('resolutions')
            .select('drafter_panelist_id')
            .eq('session_id', sessionId)
            .limit(1)
            .single();
          drafterId = existingRes?.drafter_panelist_id || null;
        }

        // Final fallback: first AI panelist
        if (!drafterId) {
          drafterId = panelists.find((p) => !p.is_human)?.id || panelists[0]?.id;
        }

        if (!drafterId) {
          send({ type: 'error', message: 'No drafter found', fatal: true });
          controller.close();
          return;
        }

        // Cost check
        const costCheck = await checkCostCap(sessionId, config.cost_cap_cents);
        if (!costCheck.withinBudget) {
          send({ type: 'error', message: 'Cost cap exceeded', fatal: true });
          controller.close();
          return;
        }

        // Set up event bus
        sessionBus.create(sessionId);
        sessionBus.setRunning(sessionId, true);
        const unsubscribe = sessionBus.subscribe(sessionId, send);

        const emit = (event: SSEEvent) => sessionBus.emit(sessionId, event);

        try {
          // Mark old resolutions as rejected
          await supabaseServer
            .from('resolutions')
            .update({ status: 'rejected' })
            .eq('session_id', sessionId)
            .in('status', ['draft', 'approved']);

          // Set session back to drafting
          await supabaseServer.from('sessions').update({ status: 'drafting' as SessionStatus }).eq('id', sessionId);
          emit({ type: 'phase_change', phase: 'drafting' });

          const drafter = panelists.find((p) => p.id === drafterId);
          emit({ type: 'drafter_elected', panelistId: drafterId, panelistName: drafter?.display_name || 'Unknown' });

          // Re-run drafting
          const resolutionId = await runDraftingPhase(sessionId, drafterId, panelists, session, config, emit);

          // Re-run voting
          await supabaseServer.from('sessions').update({ status: 'voting' as SessionStatus }).eq('id', sessionId);
          emit({ type: 'phase_change', phase: 'voting' });

          const finalResolutionId = await runVotingPhase(
            sessionId, resolutionId, drafterId, panelists, session, config, emit
          );

          // Done
          await supabaseServer.from('sessions').update({ status: 'completed' as SessionStatus }).eq('id', sessionId);
          emit({ type: 'session_complete', resolutionId: finalResolutionId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Redraft error';
          emit({ type: 'error', message: msg, fatal: true });
          await supabaseServer.from('sessions').update({ status: 'abandoned' as SessionStatus }).eq('id', sessionId);
        } finally {
          unsubscribe();
          sessionBus.setRunning(sessionId, false);
          controller.close();
        }
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'Stream error', fatal: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
