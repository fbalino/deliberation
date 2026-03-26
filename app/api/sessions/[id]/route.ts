import { NextResponse } from 'next/server';
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
