import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionConfig } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

// POST: Generate or retrieve cached summaries for a session's panelists
// Body: { sessionId: string, panelists: Array<{ id: string, text: string }> }
// Returns: { summaries: Record<string, string> }
export async function POST(request: NextRequest) {
  try {
    const { sessionId, panelists } = await request.json() as {
      sessionId?: string;
      panelists?: Array<{ id: string; text: string }>;
      text?: string;
    };

    // Legacy single-text mode (fallback)
    if (!sessionId || !panelists) {
      const { text } = await request.clone().json();
      if (!text) return NextResponse.json({ error: 'sessionId + panelists or text required' }, { status: 400 });
      const summary = await generateSummary(text);
      return NextResponse.json({ summary });
    }

    // Check if summaries are already cached on the session
    const session = await getSession(sessionId);

    const config = (session?.config || {}) as Record<string, unknown>;
    const cached = config._panelist_summaries as Record<string, string> | undefined;

    if (cached && Object.keys(cached).length >= panelists.length) {
      return NextResponse.json({ summaries: cached });
    }

    // Generate all summaries in parallel
    const summaries: Record<string, string> = cached || {};
    const toGenerate = panelists.filter((p) => !summaries[p.id]);

    await Promise.all(
      toGenerate.map(async (p) => {
        summaries[p.id] = await generateSummary(p.text);
      })
    );

    // Cache on the session config
    await updateSessionConfig(sessionId, { ...config, _panelist_summaries: summaries });

    return NextResponse.json({ summaries });
  } catch {
    return NextResponse.json({ summaries: {} });
  }
}

async function generateSummary(text: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 200);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        reasoning_effort: 'none',
        max_completion_tokens: 100,
        messages: [
          { role: 'system', content: 'Summarize the following analysis in exactly 1-2 sentences. Be concise and capture the key finding or position. No preamble.' },
          { role: 'user', content: text.slice(0, 3000) },
        ],
      }),
    });

    if (!res.ok) {
      return text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 200);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || text.slice(0, 200);
  } catch {
    return text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 200);
  }
}
