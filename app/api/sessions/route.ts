import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { CreateSessionRequest } from '@/lib/supabase/types';

// POST: Create a new session
export async function POST(request: NextRequest) {
  try {
    const body: CreateSessionRequest = await request.json();

    if (!body.title || !body.briefing_text || !body.panelists?.length) {
      return NextResponse.json(
        { error: 'title, briefing_text, and panelists are required' },
        { status: 400 }
      );
    }

    if (body.panelists.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 panelists are required' },
        { status: 400 }
      );
    }

    // Insert session
    const { data: session, error: sessionError } = await supabaseServer
      .from('sessions')
      .insert({
        title: body.title,
        status: 'configuring',
        config: body.config,
        briefing_text: body.briefing_text,
        briefing_urls: body.briefing_urls || [],
        tags: body.tags || [],
      })
      .select()
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: `Failed to create session: ${sessionError?.message}` },
        { status: 500 }
      );
    }

    // Insert panelists
    const { error: panelistError } = await supabaseServer
      .from('panelists')
      .insert(
        body.panelists.map((p, i) => ({
          session_id: session.id,
          display_name: p.display_name,
          model_id: p.model_id,
          system_prompt: p.system_prompt || null,
          avatar_color: p.avatar_color,
          is_human: p.is_human,
          sort_order: p.sort_order ?? i,
        }))
      );

    if (panelistError) {
      return NextResponse.json(
        { error: `Failed to create panelists: ${panelistError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: session.id });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

// GET: List all sessions
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    let query = supabaseServer
      .from('sessions')
      .select('*, panelists(count)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,briefing_text.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
