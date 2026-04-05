import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { fetchUrlContent } from '@/lib/files/url-fetcher';
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

    // Fetch URL content and append to briefing
    let augmentedBriefing = body.briefing_text;
    if (body.briefing_urls && body.briefing_urls.length > 0) {
      for (const url of body.briefing_urls) {
        if (!url.trim()) continue;
        try {
          const { title, text } = await fetchUrlContent(url.trim());
          augmentedBriefing += `\n\n--- Content from URL: ${title} (${url}) ---\n${text}`;
        } catch (err) {
          augmentedBriefing += `\n\n--- Failed to fetch URL: ${url} (${err instanceof Error ? err.message : 'unknown error'}) ---`;
        }
      }
    }

    // Insert session
    const { data: session, error: sessionError } = await supabaseServer
      .from('sessions')
      .insert({
        title: body.title,
        status: 'configuring',
        config: body.config,
        briefing_text: augmentedBriefing,
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

    // Resolve pre-assigned drafter sort_order to real UUID
    if (body.config.pre_assigned_drafter_id) {
      const sortOrder = parseInt(body.config.pre_assigned_drafter_id);
      if (!isNaN(sortOrder)) {
        const { data: drafterPanelist } = await supabaseServer
          .from('panelists')
          .select('id')
          .eq('session_id', session.id)
          .eq('sort_order', sortOrder)
          .single();

        if (drafterPanelist) {
          await supabaseServer
            .from('sessions')
            .update({ config: { ...body.config, pre_assigned_drafter_id: drafterPanelist.id } })
            .eq('id', session.id);
        }
      }
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
