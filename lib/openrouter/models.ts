import type { ModelDefinition } from './types';
import type { PanelistConfig } from '@/lib/supabase/types';

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'claude-opus-4-6-20250620',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    inputPricePerMTok: 5,
    outputPricePerMTok: 25,
    contextWindow: 200000,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    inputPricePerMTok: 2,
    outputPricePerMTok: 8,
    contextWindow: 1047576,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: 'gemini-2.5-pro-preview-06-05',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    inputPricePerMTok: 1.25,
    outputPricePerMTok: 10,
    contextWindow: 1048576,
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
