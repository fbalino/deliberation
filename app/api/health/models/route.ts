import { NextResponse } from 'next/server';
import { MODEL_REGISTRY } from '@/lib/openrouter/models';

export const dynamic = 'force-dynamic';

async function checkAnthropic(): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY not set', latencyMs: 0 };

  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, latencyMs };
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 100)}`, latencyMs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', latencyMs: Date.now() - start };
  }
}

async function checkOpenAI(): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: 'OPENAI_API_KEY not set', latencyMs: 0 };

  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-5.4', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, latencyMs };
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 100)}`, latencyMs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', latencyMs: Date.now() - start };
  }
}

async function checkGoogle(): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: 'GEMINI_API_KEY not set', latencyMs: 0 };

  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
      }
    );
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, latencyMs };
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 100)}`, latencyMs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const [anthropic, openai, google] = await Promise.all([
    checkAnthropic(),
    checkOpenAI(),
    checkGoogle(),
  ]);

  const results: Record<string, { ok: boolean; error?: string; latencyMs: number }> = {};
  for (const model of MODEL_REGISTRY) {
    switch (model.provider) {
      case 'anthropic': results[model.id] = anthropic; break;
      case 'openai': results[model.id] = openai; break;
      case 'google': results[model.id] = google; break;
    }
  }

  return NextResponse.json(results);
}
