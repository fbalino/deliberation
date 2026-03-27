import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Uses GPT-5.4 with reasoning off for cheap, fast summarization
export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ summary: text.split(/[.!?]\s/).slice(0, 2).join('. ').slice(0, 200) });

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
      // Fallback to first 2 sentences
      return NextResponse.json({ summary: text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 200) });
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || text.slice(0, 200);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: 'Summary unavailable' });
  }
}
