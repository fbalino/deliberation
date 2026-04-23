'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { MODEL_REGISTRY, AVATAR_COLORS, DEFAULT_DELIBERATOR_NAMES } from '@/lib/openrouter/models';
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
        display_name: DEFAULT_DELIBERATOR_NAMES[panelists.length % DEFAULT_DELIBERATOR_NAMES.length],
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Deliberators ({panelists.length})</h3>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
              Blind identities
            </span>
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
            Deliberators see names only. Backing models stay private to the app.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button variant="secondary" size="sm" onClick={addPanelist}>
            + Add
          </Button>
        </div>
      </div>

      {panelists.map((panelist, index) => (
        <div
          key={index}
          className="p-4 space-y-4"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface)',
          }}
        >
          <div className="grid gap-3">
            {/* Avatar color */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-10 w-10 shrink-0 rounded-full text-sm font-bold text-white"
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
              >
                {panelist.display_name.charAt(0) || '?'}
              </button>
              <StatusDot modelId={panelist.model_id} />
            </div>

            <div className="grid gap-3">
              <Input
                label="Public name"
                value={panelist.display_name}
                onChange={(e) => updatePanelist(index, { display_name: e.target.value })}
                placeholder="e.g., Mary Sotheby"
              />

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Private backing model
                </label>
                <select
                  value={panelist.model_id}
                  onChange={(e) => updatePanelist(index, { model_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm"
                  style={selectStyle}
                >
                  {MODEL_REGISTRY.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              >
                {expandedIndex === index ? 'Hide prompt' : 'Prompt'}
              </Button>
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
          </div>

          {/* Error message if connection failed */}
          {modelStatus[panelist.model_id] && !modelStatus[panelist.model_id].ok && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {modelStatus[panelist.model_id].error}
            </p>
          )}

          {/* Latency if connected */}
          {modelStatus[panelist.model_id]?.ok && (
            <p className="text-xs" style={{ color: 'var(--success)' }}>
              Private model connected ({modelStatus[panelist.model_id].latencyMs}ms)
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
