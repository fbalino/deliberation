'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThinkingBlock } from './ThinkingBlock';
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

interface PanelistColumn {
  panelistId: string;
  panelistName: string;
  panelistColor: string;
  modelId: string;
  entries: Array<{
    phase: string;
    roundNumber: number;
    content: string;
    thinkingContent: string;
    isStreaming: boolean;
    isThinkingStreaming: boolean;
  }>;
}

interface Props {
  rounds: RoundGroup[];
  panelistIds: string[];
  panelistMap: Map<string, { display_name: string; avatar_color: string | null; model_id: string }>;
  filterPhases?: string[];
}

const PHASE_SHORT: Record<string, string> = {
  analysis: 'Analysis',
  discussion: 'Discussion',
  drafter_election: 'Election',
  drafting: 'Draft',
  voting: 'Vote',
};

export function ContributionFeed({ rounds, panelistIds, panelistMap, filterPhases }: Props) {
  const columnsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll each column body to bottom as new content streams in
  useEffect(() => {
    if (!columnsRef.current) return;
    const bodies = columnsRef.current.querySelectorAll('[data-column-body]');
    bodies.forEach((body) => {
      const el = body as HTMLElement;
      if (el.dataset.userScrolled !== 'true') {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [rounds]);

  // Build columns: one per panelist
  const columns: PanelistColumn[] = panelistIds.map((pid) => {
    const p = panelistMap.get(pid);
    const col: PanelistColumn = {
      panelistId: pid,
      panelistName: p?.display_name || 'Unknown',
      panelistColor: p?.avatar_color || '#6366f1',
      modelId: p?.model_id || '',
      entries: [],
    };

    const filteredRounds = filterPhases ? rounds.filter((r) => filterPhases.includes(r.phase)) : rounds;
    for (const round of filteredRounds) {
      const contrib = round.contributions.find((c) => c.panelistId === pid);
      if (contrib && (contrib.content || contrib.thinkingContent || contrib.isStreaming)) {
        col.entries.push({
          phase: round.phase,
          roundNumber: round.roundNumber,
          content: contrib.content,
          thinkingContent: contrib.thinkingContent,
          isStreaming: contrib.isStreaming,
          isThinkingStreaming: contrib.isThinkingStreaming,
        });
      }
    }

    return col;
  });

  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Waiting for deliberation to begin...
      </div>
    );
  }

  return (
    <div ref={columnsRef} className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
      {columns.map((col) => (
        <div
          key={col.panelistId}
          className="flex flex-col border border-gray-200 rounded-lg overflow-hidden min-h-0"
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: col.panelistColor }}
            >
              {col.panelistName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{col.panelistName}</div>
              <div className="text-[10px] text-gray-400 truncate">{col.modelId}</div>
            </div>
            {col.entries.some((e) => e.isStreaming) && (
              <span className="ml-auto inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
            )}
          </div>

          {/* Column body — scrollable, content flows top to bottom */}
          <div
            data-column-body
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
              el.dataset.userScrolled = atBottom ? 'false' : 'true';
            }}
            className="flex-1 overflow-y-auto px-3 py-2 space-y-3"
          >
            {col.entries.map((entry, i) => (
              <div key={`${entry.phase}-${entry.roundNumber}`}>
                {/* Phase/round label */}
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                  {PHASE_SHORT[entry.phase] || entry.phase}
                  {entry.phase === 'discussion' ? ` R${entry.roundNumber}` : ''}
                </div>

                {/* Thinking (collapsible) */}
                {entry.thinkingContent && (
                  <ThinkingBlock content={entry.thinkingContent} isStreaming={entry.isThinkingStreaming} />
                )}

                {/* Content */}
                <div className="prose prose-sm prose-gray max-w-none prose-headings:text-gray-800 prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:text-[13px] prose-p:leading-relaxed prose-p:text-gray-700 prose-li:text-[13px] prose-li:text-gray-700 prose-strong:text-gray-800 prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:text-xs prose-blockquote:border-indigo-300 prose-blockquote:text-gray-600 prose-a:text-indigo-600 prose-hr:border-gray-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content || ''}</ReactMarkdown>
                  {entry.isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse rounded-sm" />
                  )}
                </div>

                {/* Divider between entries */}
                {i < col.entries.length - 1 && <div className="border-t border-gray-100 mt-3" />}
              </div>
            ))}

            {col.entries.length === 0 && (
              <div className="text-xs text-gray-300 italic pt-4 text-center">Waiting...</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
