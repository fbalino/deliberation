'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DbPanelist } from '@/lib/supabase/types';
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

  // Find the drafter's contribution
  const draftContrib = lastDraft?.contributions.find((c) =>
    drafter ? c.panelistId === drafter.id : true
  );

  if (!draftContrib && !lastDraft) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        No draft produced yet.
      </div>
    );
  }

  const isStreaming = draftContrib?.isStreaming ?? false;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Drafter banner */}
      {drafter && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: drafter.avatar_color || '#6366f1' }}
          >
            {drafter.display_name.charAt(0)}
          </div>
          <div>
            <span className="text-sm font-semibold text-purple-900">{drafter.display_name}</span>
            <span className="text-sm text-purple-600 ml-1.5">is drafting the resolution</span>
            {isStreaming && (
              <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
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
      <div className="rounded-xl border border-gray-200 bg-white p-8 md:py-12 md:px-12">
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-4">
          Draft v{draftingRounds.length}
        </div>
        <div className="mx-auto prose prose-gray prose-headings:text-gray-900 prose-headings:font-bold prose-h1:text-2xl prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3 prose-h1:mb-6 prose-h2:text-xl prose-h2:mt-8 prose-h3:text-lg prose-p:text-[15px] prose-p:leading-7 prose-p:text-gray-700 prose-li:text-[15px] prose-li:text-gray-700 prose-li:leading-7 prose-strong:text-gray-900 prose-code:text-sm prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-blockquote:border-indigo-400 prose-blockquote:bg-indigo-50/30 prose-blockquote:text-gray-600 prose-blockquote:py-1 prose-a:text-indigo-600 prose-hr:border-gray-200 prose-hr:my-8" style={{ maxWidth: '70ch' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {draftContrib?.content || ''}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
