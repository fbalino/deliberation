'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { PanelistConfig } from '@/components/session/PanelistConfig';
import { SessionSettings } from '@/components/session/SessionSettings';
import { getDefaultPanelists } from '@/lib/openrouter/models';
import { DEFAULT_SESSION_CONFIG } from '@/lib/supabase/types';
import type { PanelistConfig as PanelistConfigType, SessionConfig } from '@/lib/supabase/types';

export default function NewSessionPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [briefingText, setBriefingText] = useState('');
  const [panelists, setPanelists] = useState<PanelistConfigType[]>(getDefaultPanelists());
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);
  const [tags, setTags] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState('');

  // Rough cost estimate
  const callsPerSession = panelists.length * (1 + config.suggested_rounds + 1 + 1); // analysis + discussion + drafting + voting
  const estimatedCost = (callsPerSession * 0.05).toFixed(2); // ~$0.05 per call average

  async function handleLaunch() {
    if (!title.trim()) return setError('Title is required');
    if (!briefingText.trim()) return setError('Briefing text is required');
    if (panelists.length < 2) return setError('At least 2 panelists are required');

    setError('');
    setIsLaunching(true);

    try {
      // Create session
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

      // Launch session
      const launchRes = await fetch(`/api/sessions/${id}/launch`, { method: 'POST' });
      if (!launchRes.ok) {
        const data = await launchRes.json();
        throw new Error(data.error || 'Failed to launch session');
      }

      // Navigate to session view
      router.push(`/session/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLaunching(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-6">New Session</h2>

      <div className="space-y-6">
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

        {/* Cost Estimate & Launch */}
        <div className="flex items-center justify-between">
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
