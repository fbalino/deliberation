import type { TokenUsage } from '@/lib/db/types';
import type { CallModelParams, StreamChunk, ModelResponse } from '../types';
import { getModelById } from '../models';
import { createTimeoutController, rethrowAbort } from '../fetch-helper';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

function buildBody(params: CallModelParams, stream: boolean) {
  const messages: Array<{ role: string; content: string }> = [];

  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  for (const m of params.messages) {
    messages.push({ role: m.role, content: typeof m.content === 'string' ? m.content : '' });
  }

  const body: Record<string, unknown> = {
    model: params.modelId,
    messages,
    stream,
  };

  if (stream) {
    body.stream_options = { include_usage: true };
  }
  body.max_completion_tokens = params.maxTokens || (getModelById(params.modelId)?.maxOutputTokens ?? 128000);

  // Chat Completions API uses top-level "reasoning_effort" (not nested "reasoning")
  // temperature is NOT supported when reasoning_effort is anything other than "none"
  body.reasoning_effort = 'medium';

  return body;
}

function estimateCost(inputTokens: number, outputTokens: number, modelId: string): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  const cost = (inputTokens / 1_000_000) * model.inputPricePerMTok +
               (outputTokens / 1_000_000) * model.outputPricePerMTok;
  return Math.round(cost * 100);
}

async function doFetch(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    rethrowAbort(err, signal);
  }
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  return res;
}

export async function* openaiStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const body = buildBody(params, true);
  const tc = createTimeoutController();
  try {
    const res = await doFetch(body, tc.signal);
    tc.onConnected();
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage: TokenUsage | null = null;

    try {
      while (true) {
        let chunkResult: ReadableStreamReadResult<Uint8Array>;
        try {
          chunkResult = await reader.read();
        } catch (err) {
          rethrowAbort(err, tc.signal);
        }
        const { done, value } = chunkResult;
        if (done) break;
        tc.onChunk();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') {
            yield {
              type: 'done',
              usage: usage || {
                input_tokens: 0, output_tokens: 0,
                thinking_tokens: 0, cached_tokens: 0, cost_cents: 0,
              },
            };
            return;
          }

          try {
            const data = JSON.parse(payload);

            if (data.usage) {
              const u = data.usage;
              usage = {
                input_tokens: u.prompt_tokens || 0,
                output_tokens: u.completion_tokens || 0,
                thinking_tokens: u.completion_tokens_details?.reasoning_tokens || 0,
                cached_tokens: u.prompt_tokens_details?.cached_tokens || 0,
                cost_cents: estimateCost(u.prompt_tokens || 0, u.completion_tokens || 0, params.modelId),
              };
            }

            const delta = data.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              yield { type: 'content', text: delta.content };
            }
            const reasoning = delta.reasoning_content || delta.reasoning;
            if (reasoning) {
              yield { type: 'reasoning', text: typeof reasoning === 'string' ? reasoning : '' };
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (usage) yield { type: 'done', usage };
  } finally {
    tc.cleanup();
  }
}

export async function openaiComplete(params: CallModelParams): Promise<ModelResponse> {
  const body = buildBody(params, false);
  const tc = createTimeoutController();
  try {
    const res = await doFetch(body, tc.signal);
    tc.onConnected();
    const data = await res.json();

    const message = data.choices?.[0]?.message;
    const u = data.usage || {};

    return {
      content: message?.content || '',
      reasoning: message?.reasoning_content || null,
      usage: {
        input_tokens: u.prompt_tokens || 0,
        output_tokens: u.completion_tokens || 0,
        thinking_tokens: u.completion_tokens_details?.reasoning_tokens || 0,
        cached_tokens: u.prompt_tokens_details?.cached_tokens || 0,
        cost_cents: estimateCost(u.prompt_tokens || 0, u.completion_tokens || 0, params.modelId),
      },
    };
  } finally {
    tc.cleanup();
  }
}
