import type { TokenUsage } from '@/lib/supabase/types';
import type { CallModelParams, StreamChunk, ModelResponse } from '../types';
import { getModelById } from '../models';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return key;
}

function buildBody(params: CallModelParams, stream: boolean) {
  const messages: Array<{ role: string; content: string }> = [];

  for (const m of params.messages) {
    messages.push({ role: m.role === 'system' ? 'user' : m.role, content: typeof m.content === 'string' ? m.content : '' });
  }

  const body: Record<string, unknown> = {
    model: params.modelId,
    messages,
    max_tokens: params.maxTokens || 16384,
    stream,
  };

  if (params.systemPrompt) {
    body.system = params.systemPrompt;
  }
  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }
  // Extended thinking
  if (params.reasoning) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: params.reasoning.maxTokens || 10000,
    };
  }

  return body;
}

function estimateCost(inputTokens: number, outputTokens: number, modelId: string): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  const cost = (inputTokens / 1_000_000) * model.inputPricePerMTok +
               (outputTokens / 1_000_000) * model.outputPricePerMTok;
  return Math.round(cost * 100);
}

async function doFetch(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  return res;
}

export async function* anthropicStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const body = buildBody(params, true);
  const res = await doFetch(body);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Anthropic SSE uses "event:" and "data:" lines
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        try {
          const data = JSON.parse(payload);

          switch (data.type) {
            case 'message_start': {
              const u = data.message?.usage;
              if (u) inputTokens = u.input_tokens || 0;
              break;
            }

            case 'content_block_start': {
              // content_block type can be 'text' or 'thinking'
              break;
            }

            case 'content_block_delta': {
              if (data.delta?.type === 'text_delta' && data.delta.text) {
                yield { type: 'content', text: data.delta.text };
              }
              if (data.delta?.type === 'thinking_delta' && data.delta.thinking) {
                yield { type: 'reasoning', text: data.delta.thinking };
              }
              break;
            }

            case 'message_delta': {
              const u = data.usage;
              if (u) outputTokens = u.output_tokens || 0;
              break;
            }

            case 'message_stop': {
              yield {
                type: 'done',
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  thinking_tokens: 0,
                  cached_tokens: 0,
                  cost_cents: estimateCost(inputTokens, outputTokens, params.modelId),
                },
              };
              return;
            }
          }
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Fallback if we never got message_stop
  yield {
    type: 'done',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      thinking_tokens: 0,
      cached_tokens: 0,
      cost_cents: estimateCost(inputTokens, outputTokens, params.modelId),
    },
  };
}

export async function anthropicComplete(params: CallModelParams): Promise<ModelResponse> {
  const body = buildBody(params, false);
  const res = await doFetch(body);
  const data = await res.json();

  let content = '';
  let reasoning: string | null = null;

  for (const block of data.content || []) {
    if (block.type === 'text') content += block.text;
    if (block.type === 'thinking') reasoning = (reasoning || '') + block.thinking;
  }

  const u = data.usage || {};

  return {
    content,
    reasoning,
    usage: {
      input_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      thinking_tokens: 0,
      cached_tokens: u.cache_read_input_tokens || 0,
      cost_cents: estimateCost(u.input_tokens || 0, u.output_tokens || 0, params.modelId),
    },
  };
}
