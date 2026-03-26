'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { MODEL_REGISTRY, AVATAR_COLORS } from '@/lib/openrouter/models';
import type { PanelistConfig as PanelistConfigType } from '@/lib/supabase/types';

interface Props {
  panelists: PanelistConfigType[];
  onChange: (panelists: PanelistConfigType[]) => void;
}

export function PanelistConfig({ panelists, onChange }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  function addPanelist() {
    const model = MODEL_REGISTRY[panelists.length % MODEL_REGISTRY.length];
    onChange([
      ...panelists,
      {
        display_name: model.name,
        model_id: model.id,
        system_prompt: '',
        avatar_color: AVATAR_COLORS[panelists.length % AVATAR_COLORS.length],
        is_human: false,
        sort_order: panelists.length,
      },
    ]);
  }

  function removePanelist(index: number) {
    if (panelists.length <= 2) return;
    onChange(panelists.filter((_, i) => i !== index).map((p, i) => ({ ...p, sort_order: i })));
  }

  function updatePanelist(index: number, updates: Partial<PanelistConfigType>) {
    onChange(panelists.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Panelists ({panelists.length})</h3>
        <Button variant="secondary" size="sm" onClick={addPanelist}>
          + Add Panelist
        </Button>
      </div>

      {panelists.map((panelist, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center gap-3">
            {/* Avatar color */}
            <button
              type="button"
              className="w-8 h-8 rounded-full shrink-0 ring-2 ring-offset-1 ring-gray-200"
              style={{ backgroundColor: panelist.avatar_color }}
              onClick={() => {
                const nextColor = AVATAR_COLORS[(AVATAR_COLORS.indexOf(panelist.avatar_color) + 1) % AVATAR_COLORS.length];
                updatePanelist(index, { avatar_color: nextColor });
              }}
              title="Click to change color"
            />

            {/* Display name */}
            <Input
              value={panelist.display_name}
              onChange={(e) => updatePanelist(index, { display_name: e.target.value })}
              placeholder="Display name"
              className="flex-1"
            />

            {/* Model selector */}
            <select
              value={panelist.model_id}
              onChange={(e) => updatePanelist(index, { model_id: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {MODEL_REGISTRY.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>

            {/* Expand/collapse system prompt */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            >
              {expandedIndex === index ? 'Hide' : 'Prompt'}
            </Button>

            {/* Remove button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removePanelist(index)}
              disabled={panelists.length <= 2}
              className="text-red-500 hover:text-red-700"
            >
              Remove
            </Button>
          </div>

          {/* System prompt (expandable) */}
          {expandedIndex === index && (
            <Textarea
              value={panelist.system_prompt}
              onChange={(e) => updatePanelist(index, { system_prompt: e.target.value })}
              placeholder="Custom system prompt (leave empty for default)"
              rows={3}
            />
          )}
        </div>
      ))}
    </div>
  );
}
