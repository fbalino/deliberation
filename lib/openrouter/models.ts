import type { ModelDefinition } from './types';
import type { PanelistConfig } from '@/lib/db/types';

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    inputPricePerMTok: 5,
    outputPricePerMTok: 25,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    inputPricePerMTok: 2.5,
    outputPricePerMTok: 15,
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'google',
    inputPricePerMTok: 2,
    outputPricePerMTok: 12,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
  },
];

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#ef4444', '#22c55e', '#3b82f6', '#f97316', '#06b6d4',
];

export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function getDefaultPanelists(): PanelistConfig[] {
  return MODEL_REGISTRY.map((model, i) => ({
    display_name: model.name,
    model_id: model.id,
    system_prompt: '',
    avatar_color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    is_human: false,
    sort_order: i,
  }));
}

export { AVATAR_COLORS };
