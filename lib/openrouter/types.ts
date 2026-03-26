import type { TokenUsage } from '@/lib/supabase/types';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenRouterContentPart[];
}

export interface OpenRouterContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  reasoning?: {
    effort?: string;
    max_tokens?: number;
  };
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
  provider: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  contextWindow: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
}

export interface CallModelParams {
  modelId: string;
  messages: OpenRouterMessage[];
  systemPrompt?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoning?: { effort?: string; maxTokens?: number };
}
