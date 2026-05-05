import type { CallModelParams, StreamChunk, ModelResponse, Provider } from './types';
import { getModelById } from './models';
import { openaiStream, openaiComplete } from './providers/openai';
import { anthropicStream, anthropicComplete } from './providers/anthropic';
import { googleStream, googleComplete } from './providers/google';
import { withProviderSlot, withProviderSlotStream } from './limiter';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function getProvider(modelId: string): Provider {
  const model = getModelById(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model.provider;
}

function callProviderStream(provider: Provider, params: CallModelParams): AsyncGenerator<StreamChunk> {
  switch (provider) {
    case 'openai':    return openaiStream(params);
    case 'anthropic': return anthropicStream(params);
    case 'google':    return googleStream(params);
    default: throw new Error(`Unsupported provider: ${provider}`);
  }
}

function callProviderComplete(provider: Provider, params: CallModelParams): Promise<ModelResponse> {
  switch (provider) {
    case 'openai':    return openaiComplete(params);
    case 'anthropic': return anthropicComplete(params);
    case 'google':    return googleComplete(params);
    default: throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function* withRetryStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const provider = getProvider(params.modelId);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      for await (const chunk of callProviderStream(provider, params)) {
        yield chunk;
      }
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

async function withRetryComplete(params: CallModelParams): Promise<ModelResponse> {
  const provider = getProvider(params.modelId);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await callProviderComplete(provider, params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function* callModelStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  const provider = getProvider(params.modelId);
  yield* withProviderSlotStream(provider, () => withRetryStream(params));
}

export async function callModelComplete(params: CallModelParams): Promise<ModelResponse> {
  const provider = getProvider(params.modelId);
  return withProviderSlot(provider, () => withRetryComplete(params));
}
