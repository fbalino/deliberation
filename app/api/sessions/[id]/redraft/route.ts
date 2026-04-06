import {
  getSession,
  listPanelists,
  listRounds,
  listDrafterVotes,
  getLatestResolution,
  markResolutionsRejected,
  updateSessionStatus,
} from '@/lib/db/queries';
import { sessionBus } from '@/lib/deliberation/event-bus';
import { runDraftingPhase } from '@/lib/deliberation/phases/drafting';
import { runVotingPhase } from '@/lib/deliberation/phases/voting';
import { checkCostCap } from '@/lib/costs/tracker';
import type { SSEEvent, DbPanelist, SessionConfig, SessionStatus } from '@/lib/db/types';

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
        const session = await getSession(sessionId);

        if (!session) {
          send({ type: 'error', message: 'Session not found', fatal: true });
          controller.close();
          return;
        }

        const config = session.config as SessionConfig;

        // Load panelists
        const panelists: DbPanelist[] = await listPanelists(sessionId);

        // Find the elected drafter from existing contributions
        const electionRounds = await listRounds(sessionId, ['drafter_election']);

        let drafterId: string | null = null;

        if (electionRounds.length) {
          const electionRoundIds = electionRounds.map((r) => r.id);
          const votes = await listDrafterVotes(electionRoundIds);

          // Tally votes
          const tally = new Map<string, number>();
          for (const v of votes) {
            if (v.drafter_vote) tally.set(v.drafter_vote, (tally.get(v.drafter_vote) || 0) + 1);
          }
          let maxVotes = 0;
          for (const [id, count] of tally) {
            if (count > maxVotes) { drafterId = id; maxVotes = count; }
          }
        }

        // Fallback: check existing resolutions for the drafter
        if (!drafterId) {
          const existingRes = await getLatestResolution(sessionId);
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
          await markResolutionsRejected(sessionId, ['draft', 'approved']);

          // Set session back to drafting
          await updateSessionStatus(sessionId, 'drafting' as SessionStatus);
          emit({ type: 'phase_change', phase: 'drafting' });

          const drafter = panelists.find((p) => p.id === drafterId);
          emit({ type: 'drafter_elected', panelistId: drafterId, panelistName: drafter?.display_name || 'Unknown' });

          // Re-run drafting
          const resolutionId = await runDraftingPhase(sessionId, drafterId, panelists, session, config, emit);

          // Re-run voting
          await updateSessionStatus(sessionId, 'voting' as SessionStatus);
          emit({ type: 'phase_change', phase: 'voting' });

          const finalResolutionId = await runVotingPhase(
            sessionId, resolutionId, drafterId, panelists, session, config, emit
          );

          // Done
          await updateSessionStatus(sessionId, 'completed' as SessionStatus);
          emit({ type: 'session_complete', resolutionId: finalResolutionId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Redraft error';
          emit({ type: 'error', message: msg, fatal: true });
          await updateSessionStatus(sessionId, 'abandoned' as SessionStatus);
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
