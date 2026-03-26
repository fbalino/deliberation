import type { TokenUsage } from '@/lib/supabase/types';
import type { CallModelParams, StreamChunk, ModelResponse, OpenRouterMessage } from './types';
import { getModelById } from './models';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  return key;
}

function buildRequestBody(params: CallModelParams, stream: boolean) {
  const messages: OpenRouterMessage[] = [];

  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  messages.push(...params.messages);

  const body: Record<string, unknown> = {
    model: params.modelId,
    messages,
    stream,
  };

  if (params.maxTokens) body.max_tokens = params.maxTokens;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.reasoning) {
    body.reasoning = {
      effort: params.reasoning.effort || 'medium',
      ...(params.reasoning.maxTokens ? { max_tokens: params.reasoning.maxTokens } : {}),
    };
  }

  return body;
}

function parseUsageFromChunk(data: Record<string, unknown>): TokenUsage | null {
  const usage = data.usage as Record<string, number> | undefined;
  if (!usage) return null;

  // OpenRouter returns cost in USD (fractional) — multiply by 100 for cents
  const costUsd = (data as Record<string, unknown>).cost as number | undefined;

  return {
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    thinking_tokens: usage.reasoning_tokens || 0,
    cached_tokens: usage.cached_tokens || 0,
    cost_cents: costUsd ? Math.round(costUsd * 100) : estimateCost(
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      data.model as string || ''
    ),
  };
}

function estimateCost(inputTokens: number, outputTokens: number, modelId: string): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  const inputCost = (inputTokens / 1_000_000) * model.inputPricePerMTok;
  const outputCost = (outputTokens / 1_000_000) * model.outputPricePerMTok;
  return Math.round((inputCost + outputCost) * 100);
}

async function fetchWithRetry(body: Record<string, unknown>, stream: boolean): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiKey()}`,
          'HTTP-Referer': 'https://deliberation.app',
          'X-Title': 'Deliberation',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return response;

      if (response.status === 429 || response.status >= 500) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    } catch (err) {
      if (err instanceof Error && !err.message.startsWith('HTTP')) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function* callModelStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const body = buildRequestBody(params, true);
  const response = await fetchWithRetry(body, true);

  if (!response.body) throw new Error('No response body for stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedUsage: TokenUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          if (accumulatedUsage) {
            yield { type: 'done', usage: accumulatedUsage };
          } else {
            yield {
              type: 'done',
              usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cached_tokens: 0, cost_cents: 0 },
            };
          }
          return;
        }

        try {
          const data = JSON.parse(payload);

          // Check for usage data
          const usage = parseUsageFromChunk(data);
          if (usage) accumulatedUsage = usage;

          const choice = data.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (!delta) continue;

          // Handle reasoning/thinking tokens — multiple possible field names
          const reasoning = delta.reasoning_content || delta.reasoning || delta.reasoning_details;
          if (reasoning) {
            const text = typeof reasoning === 'string' ? reasoning : reasoning.content || '';
            if (text) yield { type: 'reasoning', text };
          }

          // Handle content tokens
          if (delta.content) {
            yield { type: 'content', text: delta.content };
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // If we never got a [DONE], still yield usage if available
  if (accumulatedUsage) {
    yield { type: 'done', usage: accumulatedUsage };
  }
}

export async function callModelComplete(params: CallModelParams): Promise<ModelResponse> {
  const body = buildRequestBody(params, false);
  const response = await fetchWithRetry(body, false);
  const data = await response.json();

  const choice = data.choices?.[0];
  const message = choice?.message;

  const usage = parseUsageFromChunk(data) || {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cached_tokens: 0,
    cost_cents: 0,
  };

  return {
    content: message?.content || '',
    reasoning: message?.reasoning_content || message?.reasoning || null,
    usage,
  };
}
