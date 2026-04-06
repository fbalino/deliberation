import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/db/client';
import {
  createSession,
  insertPanelist,
  listSessions,
  updateSessionConfig,
  getPanelistBySortOrder,
} from '@/lib/db/queries';
import { fetchUrlContent } from '@/lib/files/url-fetcher';
import type { CreateSessionRequest } from '@/lib/db/types';

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

    const session = await transaction(async (tx) => {
      // Insert session
      const sess = await createSession(
        {
          title: body.title,
          status: 'configuring',
          config: body.config,
          briefing_text: augmentedBriefing,
          briefing_urls: body.briefing_urls || [],
          tags: body.tags || [],
        },
        tx
      );

      // Insert panelists
      for (let i = 0; i < body.panelists.length; i++) {
        const p = body.panelists[i];
        await insertPanelist(
          {
            session_id: sess.id,
            display_name: p.display_name,
            model_id: p.model_id,
            system_prompt: p.system_prompt || null,
            avatar_color: p.avatar_color,
            is_human: p.is_human,
            sort_order: p.sort_order ?? i,
          },
          tx
        );
      }

      // Resolve pre-assigned drafter sort_order to real UUID
      if (body.config.pre_assigned_drafter_id) {
        const sortOrder = parseInt(body.config.pre_assigned_drafter_id);
        if (!isNaN(sortOrder)) {
          const drafterPanelist = await getPanelistBySortOrder(sess.id, sortOrder, tx);
          if (drafterPanelist) {
            await updateSessionConfig(
              sess.id,
              { ...body.config, pre_assigned_drafter_id: drafterPanelist.id },
              tx
            );
          }
        }
      }

      return sess;
    });

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
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;

    const data = await listSessions({ status, search });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
