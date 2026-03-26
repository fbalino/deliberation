import { supabaseServer } from '@/lib/supabase/server';
import { sessionBus } from '@/lib/deliberation/event-bus';
import { runDeliberation } from '@/lib/deliberation/engine';
import type { SSEEvent, DbSession, SessionStatus, Phase, VoteVerdict } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
        // Check session state
        const { data: session } = await supabaseServer
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (!session) {
          send({ type: 'error', message: 'Session not found', fatal: true });
          controller.close();
          return;
        }

        const dbSession = session as DbSession;

        // If session is already completed, send historical events
        if (dbSession.status === 'completed' || dbSession.status === 'abandoned') {
          await sendHistoricalEvents(sessionId, send);
          controller.close();
          return;
        }

        // Check if engine is already running
        if (sessionBus.isRunning(sessionId)) {
          // Subscribe to existing stream
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

        // Start the engine inline — this keeps the SSE connection alive
        sessionBus.create(sessionId);
        sessionBus.setRunning(sessionId, true);

        // Also subscribe to the bus so we capture events for the stream
        const unsubscribe = sessionBus.subscribe(sessionId, send);

        try {
          await runDeliberation(sessionId, (event) => {
            sessionBus.emit(sessionId, event);
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Engine error';
          sessionBus.emit(sessionId, { type: 'error', message: msg, fatal: true });
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
  // Load all rounds with contributions
  const { data: rounds } = await supabaseServer
    .from('rounds')
    .select('*, contributions(*, panelists!inner(display_name))')
    .eq('session_id', sessionId)
    .order('round_number');

  const { data: panelists } = await supabaseServer
    .from('panelists')
    .select('*')
    .eq('session_id', sessionId);

  const { data: resolutions } = await supabaseServer
    .from('resolutions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'approved')
    .limit(1);

  let lastPhase = '';

  for (const round of rounds || []) {
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

    const contributions = (round as Record<string, unknown>).contributions as Array<{
      panelist_id: string;
      content: string;
      thinking_content: string | null;
      token_usage: Record<string, number> | null;
      vote_data: Record<string, unknown> | null;
      panelists: { display_name: string };
    }>;

    for (const contrib of contributions || []) {
      const panelist = (panelists || []).find((p) => p.id === contrib.panelist_id);
      send({
        type: 'contribution_start',
        panelistId: contrib.panelist_id,
        panelistName: panelist?.display_name || 'Unknown',
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

  if (resolutions?.[0]) {
    send({ type: 'session_complete', resolutionId: resolutions[0].id });
  }
}
