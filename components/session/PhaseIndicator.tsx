'use client';

import type { SessionStatus } from '@/lib/db/types';

const PHASES = [
  { key: 'analyzing', label: 'Analysis', filterPhases: ['analysis'] },
  { key: 'discussing', label: 'Discussion', filterPhases: ['discussion'] },
  { key: 'drafting', label: 'Drafting', filterPhases: ['drafter_election', 'drafting'] },
  { key: 'voting', label: 'Voting', filterPhases: ['voting'] },
  { key: 'completed', label: 'Resolution', filterPhases: [] },
] as const;

const PHASE_ORDER = PHASES.map((p) => p.key);

interface Props {
  currentPhase: SessionStatus;
  activeTab?: string | null;
  onTabClick?: (phaseKey: string) => void;
}

export function PhaseIndicator({ currentPhase, activeTab, onTabClick }: Props) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase as typeof PHASE_ORDER[number]);
  const adjustedIndex = currentPhase === 'drafter_election' ? 2 : currentIndex;

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-inset)' }}>
      {PHASES.map((phase, index) => {
        const isTerminal = currentPhase === 'completed' || currentPhase === 'abandoned';
        const isCompleted = adjustedIndex > index || isTerminal;
        const isActive = adjustedIndex === index && !isTerminal;
        const isSelected = activeTab === phase.key;
        const isClickable = isCompleted || isActive || isTerminal;

        return (
          <button
            key={phase.key}
            type="button"
            disabled={!isClickable && !onTabClick}
            onClick={() => onTabClick?.(phase.key)}
            className="relative flex flex-col items-center gap-1 px-3 py-2 text-xs font-semibold transition-all duration-150"
            style={{
              borderRadius: 'var(--radius-md)',
              background: isSelected ? 'var(--surface)' : 'transparent',
              boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
              color: isSelected
                ? 'var(--text)'
                : isActive
                ? 'var(--accent)'
                : isCompleted
                ? 'var(--text-secondary)'
                : 'var(--text-tertiary)',
              cursor: isClickable || onTabClick ? 'pointer' : 'default',
            }}
          >
            {/* Status dot */}
            <span
              className={`h-1.5 w-8 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`}
              style={{
                background: isCompleted && !isActive
                  ? 'var(--success)'
                  : isActive
                  ? 'var(--accent)'
                  : 'var(--border-strong)',
              }}
            />
            {phase.label}
          </button>
        );
      })}
    </div>
  );
}

export { PHASES };
