'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  sessionId: string;
  isPaused: boolean;
  isActive: boolean;
  userRole?: 'observer' | 'participant';
  currentPhase?: string;
}

export function InterventionBar({ sessionId, isPaused, isActive, userRole, currentPhase }: Props) {
  const [nudgeText, setNudgeText] = useState('');
  const [injectText, setInjectText] = useState('');
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

  async function handleStop() {
    if (!confirm('Stop this session immediately? It will be marked as abandoned.')) return;
    setIsLoading(true);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'abandoned' }),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
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
            className="flex-1 px-3 py-1.5 text-sm transition-colors duration-150"
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
          <Button variant="secondary" size="sm" onClick={handleNudge} disabled={!nudgeText.trim()}>
            Nudge
          </Button>
        </div>

        {/* Force Advance */}
        <Button variant="danger" size="sm" onClick={handleForceAdvance}>
          Force Advance
        </Button>

        {/* Stop Session */}
        <Button variant="danger" size="sm" onClick={handleStop} loading={isLoading}>
          Stop
        </Button>
      </div>

      {/* Inject as Chair (participant mode, discussion phase only) */}
      {userRole === 'participant' && currentPhase === 'discussing' && (
        <div className="flex gap-2 mt-2">
          <textarea
            value={injectText}
            onChange={(e) => setInjectText(e.target.value)}
            placeholder="Enter your contribution as Chair..."
            rows={2}
            className="flex-1 px-3 py-1.5 text-sm resize-none transition-colors duration-150"
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              if (!injectText.trim()) return;
              await sendIntervention('inject', injectText);
              setInjectText('');
            }}
            disabled={!injectText.trim()}
          >
            Submit as Chair
          </Button>
        </div>
      )}
    </div>
  );
}
