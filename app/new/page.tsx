'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { PanelistConfig } from '@/components/session/PanelistConfig';
import { SessionSettings } from '@/components/session/SessionSettings';
import { getDefaultPanelists } from '@/lib/openrouter/models';
import { DEFAULT_SESSION_CONFIG } from '@/lib/db/types';
import type { PanelistConfig as PanelistConfigType, SessionConfig, DbPreset } from '@/lib/db/types';

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>}>
      <NewSessionInner />
    </Suspense>
  );
}

function NewSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chainFrom = searchParams.get('chain_from');
  const forkFrom = searchParams.get('fork_from');

  const [title, setTitle] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [panelists, setPanelists] = useState<PanelistConfigType[]>(getDefaultPanelists());
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);
  const [briefingUrls, setBriefingUrls] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState<DbPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  // Load presets
  useEffect(() => {
    fetch('/api/presets').then((r) => r.ok ? r.json() : []).then(setPresets);
  }, []);

  // Chain from previous session (resolution → new briefing)
  useEffect(() => {
    if (!chainFrom) return;
    fetch(`/api/sessions/${chainFrom}`).then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      const resolution = data.resolutions?.find((r: { status: string }) => r.status === 'approved');
      if (resolution) {
        setBriefingText(resolution.content_markdown);
        setTitle(`Follow-up: ${data.title || 'Untitled'}`);
      }
    });
  }, [chainFrom]);

  // Fork from previous session (same config + briefing + panelists)
  useEffect(() => {
    if (!forkFrom) return;
    fetch(`/api/sessions/${forkFrom}`).then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      setTitle(`Fork: ${data.title || 'Untitled'}`);
      setBriefingText(data.briefing_text || '');
      if (data.config) setConfig(data.config);
      if (data.tags) setTags(data.tags.join(', '));
      if (data.panelists?.length) {
        setPanelists(data.panelists.map((p: { display_name: string; model_id: string; system_prompt: string | null; avatar_color: string | null; is_human: boolean; sort_order: number }) => ({
          display_name: p.display_name,
          model_id: p.model_id,
          system_prompt: p.system_prompt || '',
          avatar_color: p.avatar_color || '#6366f1',
          is_human: p.is_human,
          sort_order: p.sort_order,
        })));
      }
    });
  }, [forkFrom]);

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
          briefing_urls: briefingUrls.filter(Boolean),
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

      // Upload files if any
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`/api/sessions/${id}/files`, { method: 'POST', body: formData });
      }

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
      <h2 className="dl-serif text-3xl mb-8" style={{ color: 'var(--text)' }}>New Session</h2>

      <div className="space-y-6">
        {/* Presets */}
        {presets.length > 0 && (
          <Card>
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Load Preset</h3>
            <div className="flex gap-2 flex-wrap">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--surface-inset)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-md)',
                  }}
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
            <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>
              Pre-filled from previous session resolution
            </p>
          )}
        </Card>

        {/* Briefing URLs */}
        <Card>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Reference URLs (optional)</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Content will be fetched and included in the briefing context.</p>
          {briefingUrls.map((url, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <Input
                value={url}
                onChange={(e) => {
                  const updated = [...briefingUrls];
                  updated[i] = e.target.value;
                  setBriefingUrls(updated);
                }}
                placeholder="https://example.com/article"
                className="flex-1"
              />
              <Button variant="ghost" size="sm" onClick={() => setBriefingUrls(briefingUrls.filter((_, j) => j !== i))} style={{ color: 'var(--danger)' }}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setBriefingUrls([...briefingUrls, ''])}>
            + Add URL
          </Button>
        </Card>

        {/* File Uploads */}
        <Card>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>File Attachments (optional)</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Upload PDFs, DOCX, or text files. Content will be extracted and included in the briefing.</p>
          <div
            className="p-6 text-center cursor-pointer transition-colors duration-150"
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
            }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border)';
              const dropped = Array.from(e.dataTransfer.files);
              setFiles((prev) => [...prev, ...dropped]);
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = '.pdf,.docx,.doc,.txt,.md,.csv';
              input.onchange = () => {
                if (input.files) setFiles((prev) => [...prev, ...Array.from(input.files!)]);
              };
              input.click();
            }}
          >
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Drop files here or click to browse</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>PDF, DOCX, TXT, MD, CSV</p>
          </div>
          {files.length > 0 && (
            <div className="mt-3 space-y-1">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm px-3 py-1.5"
                  style={{ background: 'var(--surface-inset)', borderRadius: 'var(--radius-sm)' }}
                >
                  <span className="truncate" style={{ color: 'var(--text)' }}>
                    {f.name} <span style={{ color: 'var(--text-tertiary)' }}>({(f.size / 1024).toFixed(0)} KB)</span>
                  </span>
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-xs ml-2" style={{ color: 'var(--danger)' }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Panelists */}
        <Card>
          <PanelistConfig panelists={panelists} onChange={setPanelists} />
        </Card>

        {/* Settings */}
        <Card>
          <SessionSettings config={config} onChange={setConfig} panelists={panelists} />
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
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Save as Preset</h3>
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
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Estimated cost: ~${estimatedCost}
          </p>

          <div className="flex items-center gap-3">
            {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button onClick={handleLaunch} loading={isLaunching} size="lg">
              Launch Deliberation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
