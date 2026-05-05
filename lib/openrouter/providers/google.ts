import type { CallModelParams, StreamChunk, ModelResponse } from '../types';
import { getModelById } from '../models';
import { createTimeoutController, rethrowAbort } from '../fetch-helper';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return key;
}

function buildBody(params: CallModelParams) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const m of params.messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : '' }],
    });
  }

  const body: Record<string, unknown> = { contents };

  if (params.systemPrompt) {
    body.systemInstruction = { parts: [{ text: params.systemPrompt }] };
  }

  const config: Record<string, unknown> = {};
  config.maxOutputTokens = params.maxTokens || (getModelById(params.modelId)?.maxOutputTokens ?? 65536);
  if (params.temperature !== undefined) config.temperature = params.temperature;
  // Always enable thinking at HIGH level
  config.thinkingConfig = { thinking_level: 'HIGH' };
  body.generationConfig = config;

  return body;
}

function estimateCost(inputTokens: number, outputTokens: number, modelId: string): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  const cost = (inputTokens / 1_000_000) * model.inputPricePerMTok +
               (outputTokens / 1_000_000) * model.outputPricePerMTok;
  return Math.round(cost * 100);
}

async function doFetch(url: string, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    rethrowAbort(err, signal);
  }
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  return res;
}

export async function* googleStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const body = buildBody(params);
  const url = `${GEMINI_BASE}/${params.modelId}:streamGenerateContent?alt=sse&key=${getApiKey()}`;
  const tc = createTimeoutController();

  try {
    const res = await doFetch(url, body, tc.signal);
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
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);

          try {
            const data = JSON.parse(payload);

            // Usage metadata
            if (data.usageMetadata) {
              inputTokens = data.usageMetadata.promptTokenCount || 0;
              outputTokens = data.usageMetadata.candidatesTokenCount || 0;
            }

            const parts = data.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.thought) {
                  yield { type: 'reasoning', text: part.text || '' };
                } else if (part.text) {
                  yield { type: 'content', text: part.text };
                }
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

export async function googleComplete(params: CallModelParams): Promise<ModelResponse> {
  const body = buildBody(params);
  const url = `${GEMINI_BASE}/${params.modelId}:generateContent?key=${getApiKey()}`;
  const tc = createTimeoutController();

  try {
    const res = await doFetch(url, body, tc.signal);
    tc.onConnected();
    const data = await res.json();

    let content = '';
    let reasoning: string | null = null;

    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.thought) {
        reasoning = (reasoning || '') + (part.text || '');
      } else if (part.text) {
        content += part.text;
      }
    }

    const u = data.usageMetadata || {};

    return {
      content,
      reasoning,
      usage: {
        input_tokens: u.promptTokenCount || 0,
        output_tokens: u.candidatesTokenCount || 0,
        thinking_tokens: u.thoughtsTokenCount || 0,
        cached_tokens: u.cachedContentTokenCount || 0,
        cost_cents: estimateCost(u.promptTokenCount || 0, u.candidatesTokenCount || 0, params.modelId),
      },
    };
  } finally {
    tc.cleanup();
  }
}
