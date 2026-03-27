'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DbResolution, DbPanelist, VoteData, VoteVerdict } from '@/lib/supabase/types';
import type { RoundGroup } from './ContributionFeed';

interface Props {
  resolution: DbResolution | null;
  panelists: DbPanelist[];
  rounds: RoundGroup[];
  sessionId: string;
}

const VERDICT_STYLE: Record<string, string> = {
  approve: 'bg-green-100 text-green-800 border-green-200',
  approve_with_amendments: 'bg-amber-100 text-amber-800 border-amber-200',
  reject: 'bg-red-100 text-red-800 border-red-200',
};

export function ResolutionPanel({ resolution, panelists, rounds, sessionId }: Props) {
  const panelistMap = new Map(panelists.map((p) => [p.id, p]));

  // Get each panelist's final analysis summary (first sentence of their analysis)
  const analysisSummaries = getAnalysisSummaries(rounds, panelistMap);

  // Get vote results
  const votes = getVotes(rounds, panelistMap);

  function downloadMarkdown() {
    if (!resolution) return;
    const blob = new Blob([resolution.content_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resolution.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!resolution) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>No resolution yet — the deliberation is still in progress.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Panelist summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {panelists.filter((p) => !p.is_human).map((p) => {
          const summary = analysisSummaries.get(p.id);
          const vote = votes.get(p.id);

          return (
            <div key={p.id} className="rounded-xl border border-gray-200 p-6 bg-white shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: p.avatar_color || '#6366f1' }}
                >
                  {p.display_name.charAt(0)}
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">{p.display_name}</div>
                  <div className="text-xs text-gray-400">{p.model_id}</div>
                </div>
                {vote && (
                  <span className={`ml-auto text-xs font-semibold px-3 py-1 rounded-full border ${VERDICT_STYLE[vote.verdict] || 'bg-gray-100 text-gray-600'}`}>
                    {vote.verdict.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
                {summary || 'No analysis recorded'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={downloadMarkdown}
          className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Download .md
        </button>
        <a
          href={`/new?chain_from=${sessionId}`}
          className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Chain → New Session
        </a>
      </div>

      {/* Resolution document — optimal reading width ~70ch */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 md:py-16 md:px-12">
        <div className="mx-auto prose prose-gray prose-headings:text-gray-900 prose-headings:font-bold prose-h1:text-2xl prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3 prose-h1:mb-6 prose-h2:text-xl prose-h2:mt-8 prose-h3:text-lg prose-p:text-[15px] prose-p:leading-7 prose-p:text-gray-700 prose-li:text-[15px] prose-li:text-gray-700 prose-li:leading-7 prose-strong:text-gray-900 prose-code:text-sm prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-blockquote:border-indigo-400 prose-blockquote:bg-indigo-50/30 prose-blockquote:text-gray-600 prose-blockquote:py-1 prose-a:text-indigo-600 prose-hr:border-gray-200 prose-hr:my-8 prose-table:text-sm prose-th:text-left prose-th:text-gray-700 prose-th:bg-gray-50 prose-td:text-gray-600" style={{ maxWidth: '70ch' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {resolution.content_markdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function getAnalysisSummaries(rounds: RoundGroup[], panelistMap: Map<string, DbPanelist>): Map<string, string> {
  const summaries = new Map<string, string>();
  const analysisRounds = rounds.filter((r) => r.phase === 'analysis');

  for (const round of analysisRounds) {
    for (const contrib of round.contributions) {
      if (contrib.content) {
        // Get first 1-2 sentences
        const sentences = contrib.content.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
        summaries.set(contrib.panelistId, sentences.slice(0, 200));
      }
    }
  }

  return summaries;
}

function getVotes(rounds: RoundGroup[], panelistMap: Map<string, DbPanelist>): Map<string, VoteData> {
  const votes = new Map<string, VoteData>();
  const votingRounds = rounds.filter((r) => r.phase === 'voting');
  const lastRound = votingRounds[votingRounds.length - 1];

  if (!lastRound) return votes;

  for (const contrib of lastRound.contributions) {
    // Try to parse vote from content
    const trimmed = contrib.content.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.verdict) {
          votes.set(contrib.panelistId, {
            verdict: parsed.verdict as VoteVerdict,
            amendments: parsed.amendments || null,
            reasoning: parsed.reasoning || '',
          });
        }
      } catch { /* skip */ }
    }
  }

  return votes;
}
