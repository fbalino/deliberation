import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db/client';
import {
  getSession,
  insertIntervention,
  findHumanPanelist,
  insertPanelist,
  getLatestRound,
  insertContribution,
  getLatestDraftResolution,
  markResolutionApproved,
} from '@/lib/db/queries';
import type { InterventionRequest, InterventionType } from '@/lib/db/types';

const VALID_TYPES: InterventionType[] = [
  'pause', 'resume', 'nudge', 'inject', 'force_advance', 'force_approve',
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body: InterventionRequest = await request.json();

    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid intervention type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify session exists and is in progress
    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed' || session.status === 'abandoned' || session.status === 'configuring') {
      return NextResponse.json(
        { error: `Cannot intervene in a session with status '${session.status}'` },
        { status: 400 }
      );
    }

    // Insert intervention
    await insertIntervention({
      session_id: sessionId,
      type: body.type,
      content: body.content || null,
    });

    // For inject (participant mode), create Chair contribution in the current round
    if (body.type === 'inject' && body.content) {
      await transaction(async (tx) => {
        // Find or create the human Chair panelist
        let chairPanelist = await findHumanPanelist(sessionId, tx);

        if (!chairPanelist) {
          chairPanelist = await insertPanelist(
            {
              session_id: sessionId,
              display_name: 'Chair',
              model_id: 'human',
              is_human: true,
              sort_order: 999,
              avatar_color: '#1e293b',
            },
            tx
          );
        }

        // Find the latest discussion round
        const latestRound = await getLatestRound(sessionId, 'discussion', tx);

        if (latestRound) {
          await insertContribution(
            {
              round_id: latestRound.id,
              panelist_id: chairPanelist.id,
              content: body.content!,
            },
            tx
          );
        }
      });
    }

    // For force_approve, also update the latest draft resolution
    if (body.type === 'force_approve') {
      const draftResolution = await getLatestDraftResolution(sessionId);
      if (draftResolution) {
        await markResolutionApproved(draftResolution.id);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
