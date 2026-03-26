'use client';

import type { SessionStatus } from '@/lib/supabase/types';

const PHASES = [
  { key: 'analyzing', label: 'Analysis' },
  { key: 'discussing', label: 'Discussion' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'voting', label: 'Voting' },
  { key: 'completed', label: 'Resolution' },
] as const;

const PHASE_ORDER = PHASES.map((p) => p.key);

interface Props {
  currentPhase: SessionStatus;
}

export function PhaseIndicator({ currentPhase }: Props) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase as typeof PHASE_ORDER[number]);
  // Treat drafter_election as part of discussing
  const adjustedIndex = currentPhase === 'drafter_election' ? 1 : currentIndex;

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase, index) => {
        const isCompleted = adjustedIndex > index || currentPhase === 'completed';
        const isActive = adjustedIndex === index && currentPhase !== 'completed';
        const isPending = adjustedIndex < index && currentPhase !== 'completed';

        return (
          <div key={phase.key} className="flex items-center">
            {index > 0 && (
              <div
                className={`h-0.5 w-8 mx-1 ${
                  isCompleted ? 'bg-indigo-500' : 'bg-gray-200'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isCompleted
                    ? 'bg-indigo-500 text-white'
                    : isActive
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  isActive ? 'text-indigo-700' : isPending ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {phase.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
