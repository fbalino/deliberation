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
  const [builderStep, setBuilderStep] = useState(1);

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

  const setupSteps = ['Briefing', 'Deliberators', 'Rules', 'Review'];
  const readiness = [
    { label: 'Briefing', value: briefingText.trim() ? 'Ready' : 'Missing', ok: Boolean(briefingText.trim()) },
    { label: 'Deliberators', value: `${panelists.length} named`, ok: panelists.length >= 2 && panelists.every((p) => p.display_name.trim()) },
    { label: 'Cost cap', value: `$${(config.cost_cap_cents / 100).toFixed(0)}`, ok: config.cost_cap_cents > 0 },
    { label: 'Voting rule', value: config.approval_threshold.replace(/_/g, ' '), ok: true },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>Guided builder</p>
        <h2 className="dl-serif mt-2 text-4xl tracking-tight md:text-5xl" style={{ color: 'var(--text)' }}>New deliberation session</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 md:text-base" style={{ color: 'var(--text-secondary)' }}>
          Build the panel one step at a time. Deliberators will see each other by name, while backing models stay private.
        </p>
      </div>

      <div className="grid gap-5 min-[1800px]:grid-cols-[260px_1fr_340px]">
        <Card>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Setup steps</h3>
          <div className="space-y-2">
            {setupSteps.map((step, index) => {
              const stepNumber = index + 1;
              const active = builderStep === stepNumber;
              const done = builderStep > stepNumber;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => setBuilderStep(stepNumber)}
                  className="flex w-full items-center gap-3 rounded-md p-3 text-left transition"
                  style={{
                    background: active ? 'var(--accent-subtle)' : 'var(--surface-inset)',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface)',
                      color: done || active ? '#fff' : 'var(--text-tertiary)',
                    }}
                  >
                    {done ? '✓' : stepNumber}
                  </span>
                  <span className="text-sm font-semibold">{step}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
        {/* Presets */}
        {presets.length > 0 && builderStep === 1 && (
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

        {builderStep === 1 && (
          <>
          <Card>
            <Input
              label="Session Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Q3 Investment Strategy Analysis"
            />
          </Card>

          <Card>
            <Textarea
              label="Briefing"
              value={briefingText}
              onChange={(e) => setBriefingText(e.target.value)}
              placeholder="Provide the topic, question, or document for the deliberators to discuss..."
              rows={8}
            />
            {chainFrom && (
              <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>
                Pre-filled from previous session resolution
              </p>
            )}
          </Card>

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
          </>
        )}

        {/* Panelists */}
        {builderStep === 2 && <Card>
          <PanelistConfig panelists={panelists} onChange={setPanelists} />
        </Card>}

        {/* Settings */}
        {builderStep === 3 && <Card>
          <SessionSettings config={config} onChange={setConfig} panelists={panelists} />
        </Card>}

        {/* Tags */}
        {builderStep === 3 && <Card>
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="investment, strategy, technical"
          />
        </Card>}

        {/* Save Preset */}
        {builderStep === 3 && <Card>
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
        </Card>}

        {builderStep === 4 && (
          <Card>
            <h3 className="dl-serif text-2xl mb-4" style={{ color: 'var(--text)' }}>Ready check</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {readiness.map((item) => (
                <div key={item.label} className="rounded-md p-4" style={{ background: item.ok ? 'var(--success-subtle)' : 'var(--warning-subtle)' }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: item.ok ? 'var(--success-text)' : 'var(--warning-text)' }}>{item.label}</p>
                  <p className="mt-2 text-lg font-bold" style={{ color: 'var(--text)' }}>{item.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              The deliberators will see each other as {panelists.map((p) => p.display_name || 'Unnamed').join(', ')}. Backing model IDs are not included in deliberation prompts.
            </p>
          </Card>
        )}

        {/* Cost Estimate & Launch */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setBuilderStep(Math.max(1, builderStep - 1))} disabled={builderStep === 1}>
            Back
          </Button>
          <Button onClick={() => builderStep < 4 ? setBuilderStep(builderStep + 1) : handleLaunch()} loading={isLaunching} size="lg">
            {builderStep < 4 ? 'Continue' : 'Launch Deliberation'}
          </Button>
        </div>
        </div>

        <Card>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Launch confidence</h3>
          <div className="mt-4 space-y-3">
            {readiness.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--surface-inset)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                <span className="text-sm font-semibold" style={{ color: item.ok ? 'var(--success)' : 'var(--warning)' }}>{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}>
            <p className="text-sm font-semibold">Plain-English summary</p>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--sidebar-text-muted)' }}>
              {panelists.length} deliberators will analyze the briefing, discuss for up to {config.suggested_rounds} rounds, draft a resolution, and vote under a {config.approval_threshold.replace(/_/g, ' ')} rule.
            </p>
          </div>
          <p className="mt-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Estimated cost: ~${estimatedCost}
          </p>
          {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </Card>
      </div>
    </div>
  );
}
