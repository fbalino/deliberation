import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { InterventionRequest, InterventionType } from '@/lib/supabase/types';

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
    const { data: session } = await supabaseServer
      .from('sessions')
      .select('status')
      .eq('id', sessionId)
      .single();

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
    await supabaseServer.from('interventions').insert({
      session_id: sessionId,
      type: body.type,
      content: body.content || null,
    });

    // For inject (participant mode), create Chair contribution in the current round
    if (body.type === 'inject' && body.content) {
      // Find or create the human Chair panelist
      let { data: chairPanelist } = await supabaseServer
        .from('panelists')
        .select('id')
        .eq('session_id', sessionId)
        .eq('is_human', true)
        .single();

      if (!chairPanelist) {
        const { data: newChair } = await supabaseServer
          .from('panelists')
          .insert({
            session_id: sessionId,
            display_name: 'Chair',
            model_id: 'human',
            is_human: true,
            sort_order: 999,
            avatar_color: '#1e293b',
          })
          .select()
          .single();
        chairPanelist = newChair;
      }

      if (chairPanelist) {
        // Find the latest discussion round
        const { data: latestRound } = await supabaseServer
          .from('rounds')
          .select('id')
          .eq('session_id', sessionId)
          .eq('phase', 'discussion')
          .order('round_number', { ascending: false })
          .limit(1)
          .single();

        if (latestRound) {
          await supabaseServer.from('contributions').insert({
            round_id: latestRound.id,
            panelist_id: chairPanelist.id,
            content: body.content,
          });
        }
      }
    }

    // For force_approve, also update the latest draft resolution
    if (body.type === 'force_approve') {
      const { data: resolutions } = await supabaseServer
        .from('resolutions')
        .select('id')
        .eq('session_id', sessionId)
        .eq('status', 'draft')
        .order('version', { ascending: false })
        .limit(1);

      if (resolutions?.[0]) {
        await supabaseServer
          .from('resolutions')
          .update({ status: 'approved' })
          .eq('id', resolutions[0].id);
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
