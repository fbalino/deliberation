import type { TokenUsage } from '@/lib/db/types';

export type Provider = 'anthropic' | 'openai' | 'google';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// What callModel yields during streaming
export type StreamChunk =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done'; usage: TokenUsage };

// What callModel returns for non-streaming
export interface ModelResponse {
  content: string;
  reasoning: string | null;
  usage: TokenUsage;
}

// Model registry entry
export interface ModelDefinition {
  id: string;
  name: string;
  provider: Provider;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
}

export interface CallModelParams {
  modelId: string;
  messages: Message[];
  systemPrompt?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoning?: { effort?: string; maxTokens?: number };
}

// Keep old name as alias for compatibility
export type OpenRouterMessage = Message;
export type OpenRouterContentPart = { type: 'text' | 'image_url'; text?: string; image_url?: { url: string } };
export type OpenRouterRequest = {
  model: string;
  messages: Message[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  reasoning?: { effort?: string; max_tokens?: number };
};
