'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  sessionId: string;
  isPaused: boolean;
  isActive: boolean;
}

export function InterventionBar({ sessionId, isPaused, isActive }: Props) {
  const [nudgeText, setNudgeText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isActive) return null;

  async function sendIntervention(type: string, content?: string) {
    setIsLoading(true);
    try {
      await fetch(`/api/sessions/${sessionId}/intervene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content }),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleNudge() {
    if (!nudgeText.trim()) return;
    await sendIntervention('nudge', nudgeText);
    setNudgeText('');
  }

  async function handleForceAdvance() {
    if (!confirm('Skip remaining discussion rounds and advance to drafting?')) return;
    await sendIntervention('force_advance');
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Pause/Resume */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => sendIntervention(isPaused ? 'resume' : 'pause')}
          loading={isLoading}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>

        {/* Nudge */}
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={nudgeText}
            onChange={(e) => setNudgeText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNudge()}
            placeholder="Send a directive to panelists..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <Button variant="secondary" size="sm" onClick={handleNudge} disabled={!nudgeText.trim()}>
            Nudge
          </Button>
        </div>

        {/* Force Advance */}
        <Button variant="danger" size="sm" onClick={handleForceAdvance}>
          Force Advance
        </Button>
      </div>
    </div>
  );
}
