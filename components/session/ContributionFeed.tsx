'use client';

import { useEffect, useRef } from 'react';
import { ContributionCard } from './ContributionCard';
import type { Phase } from '@/lib/supabase/types';

export interface ContributionItem {
  id: string;
  panelistId: string;
  panelistName: string;
  panelistColor: string;
  modelId: string;
  content: string;
  thinkingContent: string;
  isStreaming: boolean;
  isThinkingStreaming: boolean;
}

export interface RoundGroup {
  phase: Phase;
  roundNumber: number;
  contributions: ContributionItem[];
}

interface Props {
  rounds: RoundGroup[];
}

const PHASE_LABELS: Record<string, string> = {
  analysis: 'Independent Analysis',
  discussion: 'Discussion',
  drafter_election: 'Drafter Election',
  drafting: 'Drafting',
  voting: 'Voting',
};

export function ContributionFeed({ rounds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to bottom when new content arrives, but respect user scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container || userScrolledRef.current) return;

    container.scrollTop = container.scrollHeight;
  }, [rounds]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    userScrolledRef.current = !isAtBottom;
  }

  if (rounds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>Waiting for deliberation to begin...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4"
    >
      {rounds.map((round, roundIndex) => (
        <div key={`${round.phase}-${round.roundNumber}`}>
          {/* Round divider */}
          <div className="flex items-center gap-3 py-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {PHASE_LABELS[round.phase] || round.phase}
              {round.phase === 'discussion' ? ` — Round ${round.roundNumber}` : ''}
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Contributions */}
          {round.contributions.map((contrib) => (
            <ContributionCard
              key={contrib.id}
              panelistName={contrib.panelistName}
              panelistColor={contrib.panelistColor}
              modelId={contrib.modelId}
              content={contrib.content}
              thinkingContent={contrib.thinkingContent}
              isStreaming={contrib.isStreaming}
              isThinkingStreaming={contrib.isThinkingStreaming}
            />
          ))}

          {roundIndex < rounds.length - 1 && <div className="h-2" />}
        </div>
      ))}
    </div>
  );
}
