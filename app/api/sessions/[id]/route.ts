import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// GET: Session detail with all related data
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const [sessionRes, panelistsRes, roundsRes, interventionsRes, resolutionsRes] =
      await Promise.all([
        supabaseServer
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single(),
        supabaseServer
          .from('panelists')
          .select('*')
          .eq('session_id', sessionId)
          .order('sort_order'),
        supabaseServer
          .from('rounds')
          .select('*, contributions(*)')
          .eq('session_id', sessionId)
          .order('round_number'),
        supabaseServer
          .from('interventions')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at'),
        supabaseServer
          .from('resolutions')
          .select('*')
          .eq('session_id', sessionId)
          .order('version'),
      ]);

    if (sessionRes.error || !sessionRes.data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...sessionRes.data,
      panelists: panelistsRes.data || [],
      rounds: roundsRes.data || [],
      interventions: interventionsRes.data || [],
      resolutions: resolutionsRes.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

// PATCH: Abandon a session
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();

    if (body.status !== 'abandoned') {
      return NextResponse.json({ error: 'Only status: "abandoned" is supported' }, { status: 400 });
    }

    const { data: session } = await supabaseServer
      .from('sessions')
      .select('status')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed' || session.status === 'abandoned') {
      return NextResponse.json({ error: 'Session is already finished' }, { status: 400 });
    }

    await supabaseServer
      .from('sessions')
      .update({ status: 'abandoned' })
      .eq('id', sessionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

// DELETE: Remove a session permanently
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const { data: session } = await supabaseServer
      .from('sessions')
      .select('status')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'completed' && session.status !== 'abandoned') {
      return NextResponse.json({ error: 'Can only delete completed or abandoned sessions' }, { status: 400 });
    }

    await supabaseServer
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
