import type { CallModelParams, StreamChunk, ModelResponse } from '../types';
import { getModelById } from '../models';
import { createTimeoutController, rethrowAbort } from '../fetch-helper';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return key;
}

function buildBody(params: CallModelParams, stream: boolean) {
  const messages: Array<{ role: string; content: string }> = [];

  for (const m of params.messages) {
    messages.push({
      role: m.role === 'system' ? 'user' : m.role,
      content: typeof m.content === 'string' ? m.content : '',
    });
  }

  const body: Record<string, unknown> = {
    model: params.modelId,
    messages,
    max_tokens: params.maxTokens || (getModelById(params.modelId)?.maxOutputTokens ?? 128000),
    stream,
  };

  if (params.systemPrompt) {
    body.system = params.systemPrompt;
  }
  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }
  // Always enable adaptive thinking for Opus 4.7
  body.thinking = { type: 'adaptive' };

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
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    rethrowAbort(err, signal);
  }
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  return res;
}

export async function* anthropicStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const body = buildBody(params, true);
  const tc = createTimeoutController();
  try {
    const res = await doFetch(body, tc.signal);
    tc.onConnected();
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

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
          } catch {
            // skip malformed chunk
          }
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
  } finally {
    tc.cleanup();
  }
}

export async function anthropicComplete(params: CallModelParams): Promise<ModelResponse> {
  const body = buildBody(params, false);
  const tc = createTimeoutController();
  try {
    const res = await doFetch(body, tc.signal);
    tc.onConnected();
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
  } finally {
    tc.cleanup();
  }
}
