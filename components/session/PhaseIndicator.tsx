'use client';

import type { SessionStatus } from '@/lib/supabase/types';

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
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
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
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              isSelected
                ? 'bg-white shadow-sm text-gray-900'
                : isActive
                ? 'bg-indigo-50 text-indigo-700'
                : isCompleted
                ? 'text-gray-600 hover:bg-white/60 cursor-pointer'
                : 'text-gray-400 cursor-default'
            }`}
          >
            {/* Status dot */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isCompleted && !isActive ? 'bg-green-500' :
              isActive ? 'bg-indigo-500 animate-pulse' :
              'bg-gray-300'
            }`} />
            {phase.label}
          </button>
        );
      })}
    </div>
  );
}

export { PHASES };
