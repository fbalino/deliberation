'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { MODEL_REGISTRY, AVATAR_COLORS } from '@/lib/openrouter/models';
import type { PanelistConfig as PanelistConfigType } from '@/lib/db/types';

type ModelStatus = { ok: boolean; error?: string; latencyMs: number };

interface Props {
  panelists: PanelistConfigType[];
  onChange: (panelists: PanelistConfigType[]) => void;
}

export function PanelistConfig({ panelists, onChange }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [modelStatus, setModelStatus] = useState<Record<string, ModelStatus>>({});
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkModels();
  }, []);

  async function checkModels() {
    setChecking(true);
    try {
      const res = await fetch('/api/health/models');
      if (res.ok) setModelStatus(await res.json());
    } catch { /* ignore */ }
    setChecking(false);
  }

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

  function StatusDot({ modelId }: { modelId: string }) {
    const status = modelStatus[modelId];

    if (checking && !status) {
      return (
        <span className="relative flex h-3 w-3 shrink-0" title="Checking...">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--warning)' }} />
          <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: 'var(--warning)' }} />
        </span>
      );
    }

    if (!status) {
      return <span className="inline-flex rounded-full h-3 w-3 shrink-0" style={{ background: 'var(--border-strong)' }} title="Not checked" />;
    }

    if (status.ok) {
      return (
        <span
          className="inline-flex rounded-full h-3 w-3 shrink-0"
          style={{ background: 'var(--success)' }}
          title={`Connected (${status.latencyMs}ms)`}
        />
      );
    }

    return (
      <span
        className="inline-flex rounded-full h-3 w-3 shrink-0 cursor-help"
        style={{ background: 'var(--danger)' }}
        title={status.error || 'Connection failed'}
      />
    );
  }

  const selectStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Panelists ({panelists.length})</h3>
          <button
            type="button"
            onClick={checkModels}
            disabled={checking}
            className="text-xs transition-colors disabled:opacity-50"
            style={{ color: 'var(--text-tertiary)' }}
            title="Re-check model connections"
          >
            {checking ? 'checking...' : 'test connections'}
          </button>
        </div>
        <Button variant="secondary" size="sm" onClick={addPanelist}>
          + Add Panelist
        </Button>
      </div>

      {panelists.map((panelist, index) => (
        <div
          key={index}
          className="p-4 space-y-3"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Avatar color */}
            <button
              type="button"
              className="w-8 h-8 rounded-full shrink-0 ring-2 ring-offset-1"
              style={{
                backgroundColor: panelist.avatar_color,
                outline: '2px solid var(--border)',
                outlineOffset: '2px',
              }}
              onClick={() => {
                const nextColor = AVATAR_COLORS[(AVATAR_COLORS.indexOf(panelist.avatar_color) + 1) % AVATAR_COLORS.length];
                updatePanelist(index, { avatar_color: nextColor });
              }}
              title="Click to change color"
            />

            {/* Status dot */}
            <StatusDot modelId={panelist.model_id} />

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
              className="px-3 py-2 text-sm"
              style={selectStyle}
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
              style={{ color: 'var(--danger)' }}
            >
              Remove
            </Button>
          </div>

          {/* Error message if connection failed */}
          {modelStatus[panelist.model_id] && !modelStatus[panelist.model_id].ok && (
            <p className="text-xs pl-14" style={{ color: 'var(--danger)' }}>
              {modelStatus[panelist.model_id].error}
            </p>
          )}

          {/* Latency if connected */}
          {modelStatus[panelist.model_id]?.ok && (
            <p className="text-xs pl-14" style={{ color: 'var(--success)' }}>
              Connected ({modelStatus[panelist.model_id].latencyMs}ms)
            </p>
          )}

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
