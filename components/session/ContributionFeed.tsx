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
  electedDrafter?: { id: string; name: string; color: string } | null;
}

const PHASE_SHORT: Record<string, string> = {
  analysis: 'Analysis',
  discussion: 'Discussion',
  drafter_election: 'Election',
  drafting: 'Draft',
  voting: 'Vote',
};

/** Detect if content is JSON (like vote or election responses) and render it nicely */
function JsonCard({ content }: { content: string }) {
  const trimmed = content.trim();

  let json: Record<string, unknown> | null = null;
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      json = JSON.parse(jsonMatch[0]);
    } catch { /* not valid json */ }
  }

  if (!json) return null;

  const entries = Object.entries(json).filter(([, v]) => v !== null && v !== undefined);

  const verdictBadge: Record<string, { bg: string; text: string; border: string }> = {
    approve: { bg: 'var(--success-subtle)', text: 'var(--success-text)', border: 'var(--success)' },
    approve_with_amendments: { bg: 'var(--warning-subtle)', text: 'var(--warning-text)', border: 'var(--warning)' },
    reject: { bg: 'var(--danger-subtle)', text: 'var(--danger-text)', border: 'var(--danger)' },
  };

  return (
    <div className="overflow-hidden text-sm" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
      {entries.map(([key, value]) => {
        const strValue = String(value);
        const isVerdict = key === 'verdict' && verdictBadge[strValue];

        return (
          <div key={key} className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
            <div
              className="px-3 py-2 font-semibold text-[10px] uppercase tracking-wider w-24 shrink-0"
              style={{ background: 'var(--surface-inset)', color: 'var(--text-tertiary)' }}
            >
              {key}
            </div>
            <div className="px-3 py-2 flex-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {isVerdict ? (
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: verdictBadge[strValue].bg,
                    color: verdictBadge[strValue].text,
                    border: `1px solid ${verdictBadge[strValue].border}`,
                  }}
                >
                  {strValue.replace(/_/g, ' ')}
                </span>
              ) : (
                strValue
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Render content — detect JSON and render specially, otherwise markdown */
function ContentRenderer({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const trimmed = content.trim();
  const isJson = /^\s*\{/.test(trimmed) && /\}\s*$/.test(trimmed);

  if (isJson) {
    const jsonCard = <JsonCard content={content} />;
    if (jsonCard) {
      return (
        <div>
          {jsonCard}
          {isStreaming && <span className="inline-block w-1.5 h-4 rounded-sm mt-1 animate-pulse" style={{ background: 'var(--accent)' }} />}
        </div>
      );
    }
  }

  return (
    <div className="prose prose-sm prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:text-[13px] prose-p:leading-relaxed prose-li:text-[13px] prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:text-xs prose-a:text-[var(--accent)]" style={{ color: 'var(--text-secondary)' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
      {isStreaming && <span className="inline-block w-1.5 h-4 rounded-sm animate-pulse" style={{ background: 'var(--accent)' }} />}
    </div>
  );
}

export function ContributionFeed({ rounds, panelistIds, panelistMap, filterPhases, electedDrafter }: Props) {
  const columnsRef = useRef<HTMLDivElement>(null);

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

  // Build columns: one per panelist, strictly filtered by phase
  const columns: PanelistColumn[] = panelistIds.map((pid) => {
    const p = panelistMap.get(pid);
    const col: PanelistColumn = {
      panelistId: pid,
      panelistName: p?.display_name || 'Unknown',
      panelistColor: p?.avatar_color || '#6366f1',
      modelId: p?.model_id || '',
      entries: [],
    };

    const visibleRounds = filterPhases && filterPhases.length > 0
      ? rounds.filter((r) => filterPhases.includes(r.phase))
      : rounds;

    for (const round of visibleRounds) {
      const contrib = round.contributions.find((c) => c.panelistId === pid);
      if (contrib && (contrib.content || contrib.thinkingContent || contrib.isStreaming)) {
        const isDraftContent = round.phase === 'drafting' && contrib.content.length > 500;
        col.entries.push({
          phase: round.phase,
          roundNumber: round.roundNumber,
          content: isDraftContent
            ? `*Drafted the resolution document (${Math.round(contrib.content.length / 1000)}k chars). See the Resolution tab for the full document.*`
            : contrib.content,
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
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        Waiting for deliberation to begin...
      </div>
    );
  }

  const hasContent = columns.some((c) => c.entries.length > 0);
  const showDrafterBanner = electedDrafter && filterPhases && (filterPhases.includes('drafting') || filterPhases.includes('drafter_election') || filterPhases.includes('voting'));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Drafter banner */}
      {showDrafterBanner && (
        <div
          className="flex items-center gap-3 mb-3 px-4 py-3 shrink-0"
          style={{
            background: 'var(--purple-subtle)',
            border: '1px solid var(--purple)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: electedDrafter.color }}
          >
            {electedDrafter.name.charAt(0)}
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--purple-text)' }}>{electedDrafter.name}</span>
            <span className="text-sm ml-1.5" style={{ color: 'var(--purple)' }}>was elected to draft the resolution</span>
          </div>
        </div>
      )}

      <div ref={columnsRef} className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
      {columns.map((col) => (
        <div
          key={col.panelistId}
          className="flex flex-col overflow-hidden min-h-0"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            borderTop: `3px solid ${col.panelistColor}`,
          }}
        >
          {/* Column header */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 shrink-0"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-inset)' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: col.panelistColor }}
            >
              {col.panelistName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{col.panelistName}</div>
              <div className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{col.modelId}</div>
            </div>
            {col.entries.some((e) => e.isStreaming) && (
              <span className="ml-auto inline-block w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: 'var(--success)' }} />
            )}
          </div>

          {/* Column body */}
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
              <div key={`${col.panelistId}-${entry.phase}-${entry.roundNumber}`}>
                {/* Phase/round label */}
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  {PHASE_SHORT[entry.phase] || entry.phase}
                  {entry.phase === 'discussion' ? ` R${entry.roundNumber}` : ''}
                </div>

                {/* Thinking (collapsible) */}
                {entry.thinkingContent && (
                  <ThinkingBlock content={entry.thinkingContent} isStreaming={entry.isThinkingStreaming} />
                )}

                {/* Content */}
                <ContentRenderer content={entry.content} isStreaming={entry.isStreaming} />

                {/* Divider between entries */}
                {i < col.entries.length - 1 && <div className="mt-3" style={{ borderTop: '1px solid var(--border)' }} />}
              </div>
            ))}

            {col.entries.length === 0 && (
              <div className="text-xs italic pt-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                {hasContent ? 'No content in this phase' : 'Waiting...'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
