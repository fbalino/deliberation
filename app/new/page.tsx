'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { PanelistConfig } from '@/components/session/PanelistConfig';
import { SessionSettings } from '@/components/session/SessionSettings';
import { getDefaultPanelists } from '@/lib/openrouter/models';
import { DEFAULT_SESSION_CONFIG } from '@/lib/supabase/types';
import type { PanelistConfig as PanelistConfigType, SessionConfig, DbPreset } from '@/lib/supabase/types';

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading...</div>}>
      <NewSessionInner />
    </Suspense>
  );
}

function NewSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chainFrom = searchParams.get('chain_from');

  const [title, setTitle] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [panelists, setPanelists] = useState<PanelistConfigType[]>(getDefaultPanelists());
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);
  const [tags, setTags] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState<DbPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  // Load presets
  useEffect(() => {
    fetch('/api/presets').then((r) => r.ok ? r.json() : []).then(setPresets);
  }, []);

  // Chain from previous session
  useEffect(() => {
    if (!chainFrom) return;
    fetch(`/api/sessions/${chainFrom}`).then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      // Use the resolution as briefing
      const resolution = data.resolutions?.find((r: { status: string }) => r.status === 'approved');
      if (resolution) {
        setBriefingText(resolution.content_markdown);
        setTitle(`Follow-up: ${data.title || 'Untitled'}`);
      }
    });
  }, [chainFrom]);

  // Rough cost estimate
  const callsPerSession = panelists.length * (1 + config.suggested_rounds + 1 + 1);
  const estimatedCost = (callsPerSession * 0.05).toFixed(2);

  async function handleLaunch() {
    if (!title.trim()) return setError('Title is required');
    if (!briefingText.trim()) return setError('Briefing text is required');
    if (panelists.length < 2) return setError('At least 2 panelists are required');

    setError('');
    setIsLaunching(true);

    try {
      const createRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          briefing_text: briefingText.trim(),
          panelists,
          config,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const { id } = await createRes.json();

      const launchRes = await fetch(`/api/sessions/${id}/launch`, { method: 'POST' });
      if (!launchRes.ok) {
        const data = await launchRes.json();
        throw new Error(data.error || 'Failed to launch session');
      }

      router.push(`/session/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLaunching(false);
    }
  }

  async function savePreset() {
    if (!presetName.trim()) return;
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: presetName.trim(),
        config: { panelists, session_config: config },
      }),
    });
    if (res.ok) {
      const preset = await res.json();
      setPresets([preset, ...presets]);
      setPresetName('');
    }
  }

  function loadPreset(preset: DbPreset) {
    const presetConfig = preset.config as { panelists?: PanelistConfigType[]; session_config?: SessionConfig };
    if (presetConfig.panelists) setPanelists(presetConfig.panelists);
    if (presetConfig.session_config) setConfig(presetConfig.session_config);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">New Session</h2>

      <div className="space-y-6">
        {/* Presets */}
        {presets.length > 0 && (
          <Card>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Load Preset</h3>
            <div className="flex gap-2 flex-wrap">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Title */}
        <Card>
          <Input
            label="Session Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Q3 Investment Strategy Analysis"
          />
        </Card>

        {/* Briefing */}
        <Card>
          <Textarea
            label="Briefing"
            value={briefingText}
            onChange={(e) => setBriefingText(e.target.value)}
            placeholder="Provide the topic, question, or document for the panelists to deliberate on..."
            rows={8}
          />
          {chainFrom && (
            <p className="text-xs text-indigo-600 mt-2">
              Pre-filled from previous session resolution
            </p>
          )}
        </Card>

        {/* Panelists */}
        <Card>
          <PanelistConfig panelists={panelists} onChange={setPanelists} />
        </Card>

        {/* Settings */}
        <Card>
          <SessionSettings config={config} onChange={setConfig} />
        </Card>

        {/* Tags */}
        <Card>
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="investment, strategy, technical"
          />
        </Card>

        {/* Save Preset */}
        <Card>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Save as Preset</h3>
          <div className="flex gap-2">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="flex-1"
            />
            <Button variant="secondary" size="sm" onClick={savePreset} disabled={!presetName.trim()}>
              Save
            </Button>
          </div>
        </Card>

        {/* Cost Estimate & Launch */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-gray-500">
            Estimated cost: ~${estimatedCost}
          </p>

          <div className="flex items-center gap-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={handleLaunch} loading={isLaunching} size="lg">
              Launch Deliberation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
