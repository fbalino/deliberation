'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DbPanelist } from '@/lib/db/types';
import type { RoundGroup } from './ContributionFeed';
import { ThinkingBlock } from './ThinkingBlock';

interface Props {
  rounds: RoundGroup[];
  panelists: DbPanelist[];
  electedDrafterId: string | null;
}

export function DraftView({ rounds, panelists, electedDrafterId }: Props) {
  const draftingRounds = rounds.filter((r) => r.phase === 'drafting');
  const lastDraft = draftingRounds[draftingRounds.length - 1];

  const drafter = electedDrafterId ? panelists.find((p) => p.id === electedDrafterId) : null;

  const draftContrib = lastDraft?.contributions.find((c) =>
    drafter ? c.panelistId === drafter.id : true
  );

  if (!draftContrib && !lastDraft) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        No draft produced yet.
      </div>
    );
  }

  const isStreaming = draftContrib?.isStreaming ?? false;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Drafter banner */}
      {drafter && (
        <div
          className="flex items-center gap-3 mb-4 px-4 py-3"
          style={{
            background: 'var(--purple-subtle)',
            border: '1px solid var(--purple)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: drafter.avatar_color || '#6366f1' }}
          >
            {drafter.display_name.charAt(0)}
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--purple-text)' }}>{drafter.display_name}</span>
            <span className="text-sm ml-1.5" style={{ color: 'var(--purple)' }}>is drafting the resolution</span>
            {isStreaming && (
              <span className="ml-2 inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
            )}
          </div>
        </div>
      )}

      {/* Thinking */}
      {draftContrib?.thinkingContent && (
        <div className="mb-4">
          <ThinkingBlock content={draftContrib.thinkingContent} isStreaming={draftContrib.isThinkingStreaming} />
        </div>
      )}

      {/* Draft document */}
      <div className="p-8 md:py-12 md:px-12" style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
          Draft v{draftingRounds.length}
        </div>
        <div className="mx-auto prose prose-gray dark:prose-invert prose-headings:font-bold prose-h1:text-2xl prose-h1:pb-3 prose-h1:mb-6 prose-h2:text-xl prose-h2:mt-8 prose-h3:text-lg prose-p:text-[15px] prose-p:leading-7 prose-li:text-[15px] prose-li:leading-7 prose-code:text-sm prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:text-xs prose-a:text-[var(--accent)]" style={{ maxWidth: '70ch', color: 'var(--text-secondary)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {draftContrib?.content || ''}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 rounded-sm animate-pulse" style={{ background: 'var(--accent)' }} />
          )}
        </div>
      </div>
    </div>
  );
}
