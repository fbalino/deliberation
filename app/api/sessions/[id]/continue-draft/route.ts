import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { callModelStream } from '@/lib/openrouter/client';
import type { SSEEvent, TokenUsage } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/sessions/[id]/continue-draft
 * SSE endpoint — takes the truncated resolution, sends it to the drafter model
 * with instructions to continue from where it stopped, streams the continuation,
 * and appends it to the existing resolution.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* closed */ }
      }

      try {
        // Load the latest resolution
        const { data: resolution } = await supabaseServer
          .from('resolutions')
          .select('*, panelists!drafter_panelist_id(model_id, display_name)')
          .eq('session_id', sessionId)
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (!resolution) {
          send({ type: 'error', message: 'No resolution found to continue', fatal: true });
          controller.close();
          return;
        }

        const drafterInfo = resolution.panelists as unknown as { model_id: string; display_name: string } | null;
        const modelId = drafterInfo?.model_id || 'claude-opus-4-6';
        const drafterName = drafterInfo?.display_name || 'Drafter';

        send({ type: 'intervention_prompt', message: `Continuing truncated draft with ${drafterName}...` });

        // Load the full deliberation transcript so Opus has full context
        const { data: rounds } = await supabaseServer
          .from('rounds')
          .select('id, phase, round_number')
          .eq('session_id', sessionId)
          .in('phase', ['analysis', 'discussion'])
          .order('round_number');

        const roundIds = (rounds || []).map((r) => r.id);
        const { data: allContribs } = await supabaseServer
          .from('contributions')
          .select('*, panelists!inner(display_name)')
          .in('round_id', roundIds.length > 0 ? roundIds : ['__none__'])
          .order('created_at');

        const analysisRoundIds = (rounds || []).filter((r) => r.phase === 'analysis').map((r) => r.id);
        const discussionRoundIds = (rounds || []).filter((r) => r.phase === 'discussion').map((r) => r.id);

        const analysesText = (allContribs || [])
          .filter((c) => analysisRoundIds.includes(c.round_id))
          .map((c) => {
            const name = (c as Record<string, unknown>).panelists as { display_name: string } | undefined;
            return `[${name?.display_name || 'Unknown'}]:\n${c.content}`;
          })
          .join('\n\n---\n\n');

        const discussionText = (allContribs || [])
          .filter((c) => discussionRoundIds.includes(c.round_id))
          .map((c) => {
            const name = (c as Record<string, unknown>).panelists as { display_name: string } | undefined;
            return `[${name?.display_name || 'Unknown'}]:\n${c.content}`;
          })
          .join('\n\n');

        // Load the session briefing
        const { data: sessionData } = await supabaseServer
          .from('sessions')
          .select('briefing_text')
          .eq('id', sessionId)
          .single();

        const briefing = sessionData?.briefing_text || '';
        const truncatedContent = resolution.content_markdown;

        const systemPrompt = 'You are continuing a resolution document that was cut off mid-generation. You have access to the full briefing, analyses, and discussion transcript that informed the original draft. Pick up EXACTLY where the text stopped — do not repeat any content that already exists. Continue writing the remaining sections to completion. Output only the continuation in Markdown.';

        const userPrompt = `Here is the complete deliberation record:\n\nBRIEFING:\n${briefing}\n\nANALYSES:\n${analysesText}\n\nDISCUSSION:\n${discussionText}\n\n---\n\nThe following resolution document was drafted from the above deliberation but was TRUNCATED. It cuts off abruptly. Continue writing from EXACTLY where it stopped. Do NOT repeat any text that already appears below — just write the missing remainder.\n\n--- TRUNCATED DOCUMENT (continue from the end) ---\n\n${truncatedContent}`;

        let continuation = '';
        let usage: TokenUsage = { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0 };

        const modelStream = callModelStream({
          modelId,
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          stream: true,
        });

        for await (const chunk of modelStream) {
          if (chunk.type === 'content') {
            continuation += chunk.text;
            send({ type: 'contribution_chunk', panelistId: 'continue', text: chunk.text, isThinking: false });
          } else if (chunk.type === 'reasoning') {
            send({ type: 'contribution_chunk', panelistId: 'continue', text: chunk.text, isThinking: true });
          } else if (chunk.type === 'done') {
            usage = chunk.usage;
          }
        }

        // Append continuation to the resolution
        const updatedMarkdown = truncatedContent + '\n' + continuation;

        await supabaseServer
          .from('resolutions')
          .update({ content_markdown: updatedMarkdown, status: 'approved' })
          .eq('id', resolution.id);

        send({ type: 'intervention_prompt', message: `Draft completed — ${continuation.length} characters appended` });
        send({ type: 'session_complete', resolutionId: resolution.id });
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'Continue error', fatal: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
    },
  });
}
