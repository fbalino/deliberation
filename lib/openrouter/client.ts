import type { CallModelParams, StreamChunk, ModelResponse } from './types';
import { getModelById } from './models';
import { openaiStream, openaiComplete } from './providers/openai';
import { anthropicStream, anthropicComplete } from './providers/anthropic';
import { googleStream, googleComplete } from './providers/google';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function getProvider(modelId: string) {
  const model = getModelById(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model.provider;
}

async function* withRetryStream(params: CallModelParams): AsyncGenerator<StreamChunk> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const provider = getProvider(params.modelId);
      let stream: AsyncGenerator<StreamChunk>;

      switch (provider) {
        case 'openai':
          stream = openaiStream(params);
          break;
        case 'anthropic':
          stream = anthropicStream(params);
          break;
        case 'google':
          stream = googleStream(params);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      for await (const chunk of stream) {
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
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const provider = getProvider(params.modelId);

      switch (provider) {
        case 'openai':
          return await openaiComplete(params);
        case 'anthropic':
          return await anthropicComplete(params);
        case 'google':
          return await googleComplete(params);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
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
  yield* withRetryStream(params);
}

export async function callModelComplete(params: CallModelParams): Promise<ModelResponse> {
  return withRetryComplete(params);
}
