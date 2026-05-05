import { getSession, listRounds, listPanelists, listContributionsForRounds, getApprovedResolution } from '@/lib/db/queries';
import { sessionBus } from '@/lib/deliberation/event-bus';
import { runDeliberation, EngineLockBusyError } from '@/lib/deliberation/engine';
import type { SSEEvent, DbSession, SessionStatus, Phase, VoteVerdict } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

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
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Controller may be closed
        }
      }

      try {
        const session = await getSession(sessionId);

        if (!session) {
          send({ type: 'error', message: 'Session not found', fatal: true });
          controller.close();
          return;
        }

        const dbSession = session as DbSession;

        // Terminal states: replay history and close.
        if (dbSession.status === 'completed' || dbSession.status === 'abandoned') {
          await sendHistoricalEvents(sessionId, send);
          controller.close();
          return;
        }

        // Reattach to a live in-process engine (same Node process / dev server).
        if (sessionBus.isRunning(sessionId)) {
          const replay = sessionBus.getReplayBuffer(sessionId);
          for (const event of replay) {
            send(event);
          }

          const unsubscribe = sessionBus.subscribe(sessionId, (event) => {
            send(event);
            if (event.type === 'session_complete' || (event.type === 'error' && event.fatal)) {
              unsubscribe();
              controller.close();
            }
          });

          request.signal.addEventListener('abort', () => {
            unsubscribe();
          });
          return;
        }

        // Engine paused — preserve work, surface "click Resume" message.
        if (dbSession.engine_status === 'paused') {
          await sendHistoricalEvents(sessionId, send);
          send({
            type: 'intervention_prompt',
            message: dbSession.engine_error
              ? `Engine paused: ${dbSession.engine_error}. Click Resume to continue.`
              : 'Engine paused. Click Resume to continue.',
          });
          controller.close();
          return;
        }

        // Try to acquire the DB-level lock and start the engine. The lock is
        // the only thing that prevents two function instances from racing
        // each other to start the same engine.
        sessionBus.create(sessionId);

        const unsubscribe = sessionBus.subscribe(sessionId, send);

        try {
          sessionBus.setRunning(sessionId, true);
          await runDeliberation(sessionId, (event) => {
            sessionBus.emit(sessionId, event);
          });
        } catch (error) {
          if (error instanceof EngineLockBusyError) {
            // Another instance owns the lock right now — replay history and close.
            await sendHistoricalEvents(sessionId, send);
            send({
              type: 'intervention_prompt',
              message: 'Engine is already running for this session in another process.',
            });
          } else {
            const msg = error instanceof Error ? error.message : 'Engine error';
            sessionBus.emit(sessionId, { type: 'error', message: msg, fatal: true });
          }
        } finally {
          unsubscribe();
          sessionBus.setRunning(sessionId, false);
          controller.close();
        }
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Stream error',
          fatal: true,
        });
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

async function sendHistoricalEvents(sessionId: string, send: (event: SSEEvent) => void) {
  const [rounds, panelists, approvedResolution] = await Promise.all([
    listRounds(sessionId),
    listPanelists(sessionId),
    getApprovedResolution(sessionId),
  ]);

  const roundIds = rounds.map((r) => r.id);
  const contributions = await listContributionsForRounds(roundIds);

  const contribsByRound = new Map<string, typeof contributions>();
  for (const c of contributions) {
    const arr = contribsByRound.get(c.round_id) || [];
    arr.push(c);
    contribsByRound.set(c.round_id, arr);
  }

  let lastPhase = '';

  for (const round of rounds) {
    if (round.phase !== lastPhase) {
      const statusMap: Record<string, string> = {
        analysis: 'analyzing',
        discussion: 'discussing',
        drafter_election: 'drafter_election',
        drafting: 'drafting',
        voting: 'voting',
      };
      send({ type: 'phase_change', phase: (statusMap[round.phase] || round.phase) as SessionStatus });
      lastPhase = round.phase;
    }

    send({ type: 'round_start', round: round.round_number, phase: round.phase as Phase });

    const roundContribs = contribsByRound.get(round.id) || [];

    for (const contrib of roundContribs) {
      const panelist = panelists.find((p) => p.id === contrib.panelist_id);
      send({
        type: 'contribution_start',
        panelistId: contrib.panelist_id,
        panelistName: panelist?.display_name || contrib.panelist_display_name || 'Unknown',
      });
      send({
        type: 'contribution_chunk',
        panelistId: contrib.panelist_id,
        text: contrib.content,
        isThinking: false,
      });
      if (contrib.thinking_content) {
        send({
          type: 'contribution_chunk',
          panelistId: contrib.panelist_id,
          text: contrib.thinking_content,
          isThinking: true,
        });
      }
      send({
        type: 'contribution_end',
        panelistId: contrib.panelist_id,
        tokenUsage: {
          input_tokens: contrib.token_usage?.input_tokens || 0,
          output_tokens: contrib.token_usage?.output_tokens || 0,
          thinking_tokens: contrib.token_usage?.thinking_tokens || 0,
          cached_tokens: contrib.token_usage?.cached_tokens || 0,
          cost_cents: contrib.token_usage?.cost_cents || 0,
        },
      });

      if (contrib.vote_data) {
        send({
          type: 'vote_result',
          panelistId: contrib.panelist_id,
          verdict: (contrib.vote_data.verdict as VoteVerdict) || 'approve',
          reasoning: (contrib.vote_data.reasoning as string) || '',
        });
      }
    }
  }

  if (approvedResolution) {
    send({ type: 'session_complete', resolutionId: approvedResolution.id });
  }
}
