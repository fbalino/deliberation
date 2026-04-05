'use client';

import { useEffect, useState, useCallback } from 'react';
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

const VERDICT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  approve: { bg: 'var(--success-subtle)', text: 'var(--success-text)', border: 'var(--success)' },
  approve_with_amendments: { bg: 'var(--warning-subtle)', text: 'var(--warning-text)', border: 'var(--warning)' },
  reject: { bg: 'var(--danger-subtle)', text: 'var(--danger-text)', border: 'var(--danger)' },
};

export function ResolutionPanel({ resolution, panelists, rounds, sessionId }: Props) {
  const panelistMap = new Map(panelists.map((p) => [p.id, p]));

  const [summaries, setSummaries] = useState<Map<string, string>>(new Map());
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [continuationText, setContinuationText] = useState('');
  const [resolutionContent, setResolutionContent] = useState(resolution?.content_markdown || '');

  useEffect(() => {
    if (resolution?.content_markdown) setResolutionContent(resolution.content_markdown);
  }, [resolution?.content_markdown]);

  const handleContinueDraft = useCallback(() => {
    setContinuing(true);
    setContinuationText('');
    const es = new EventSource(`/api/sessions/${sessionId}/continue-draft`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === 'contribution_chunk' && !event.isThinking) {
        setContinuationText((prev) => prev + event.text);
      }
      if (event.type === 'session_complete' || (event.type === 'error' && event.fatal)) {
        es.close();
        setContinuing(false);
        if (event.type === 'session_complete') {
          setResolutionContent((prev) => prev + '\n' + continuationText);
          window.location.reload();
        }
      }
      if (event.type === 'intervention_prompt') {
        // Could show this as a toast
      }
    };
    es.onerror = () => { es.close(); setContinuing(false); };
  }, [sessionId, continuationText]);

  const rawAnalyses = getRawAnalyses(rounds);
  const votes = getVotes(rounds, panelistMap);

  useEffect(() => {
    async function fetchSummaries() {
      setLoadingSummaries(true);

      try {
        const panelistTexts = Array.from(rawAnalyses.entries()).map(([id, text]) => ({ id, text }));
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, panelists: panelistTexts }),
        });

        if (res.ok) {
          const { summaries: data } = await res.json();
          setSummaries(new Map(Object.entries(data || {})));
        }
      } catch { /* fallback to empty */ }

      setLoadingSummaries(false);
    }

    if (rawAnalyses.size > 0) fetchSummaries();
    else setLoadingSummaries(false);
  }, [rounds.length, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function downloadPdf() {
    const el = document.getElementById('resolution-prose');
    if (!el) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Resolution</title>
      <style>
        body { font-family: Georgia, serif; max-width: 70ch; margin: 2em auto; padding: 0 1em; color: #1a1a1a; line-height: 1.7; }
        h1 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5em; }
        h2 { font-size: 1.25em; margin-top: 1.5em; }
        h3 { font-size: 1.1em; }
        code { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
        pre { background: #1f2937; color: #f3f4f6; padding: 1em; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 3px solid #6366f1; padding-left: 1em; color: #4b5563; }
        table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #e5e7eb; padding: 0.5em; text-align: left; }
      </style></head><body>${el.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  if (!resolution) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        <p>No resolution yet — the deliberation is still in progress.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Panelist summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {panelists.filter((p) => !p.is_human).map((p) => {
          const summary = summaries.get(p.id);
          const vote = votes.get(p.id);
          const vs = vote ? VERDICT_STYLE[vote.verdict] : null;

          return (
            <div
              key={p.id}
              className="p-5"
              style={{
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: p.avatar_color || '#6366f1' }}
                >
                  {p.display_name.charAt(0)}
                </div>
                <div>
                  <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>{p.display_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.model_id}</div>
                </div>
                {vote && vs && (
                  <span
                    className="ml-auto text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ background: vs.bg, color: vs.text, border: `1px solid ${vs.border}` }}
                  >
                    {vote.verdict.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {loadingSummaries ? (
                  <span className="italic" style={{ color: 'var(--text-tertiary)' }}>Summarizing...</span>
                ) : (
                  summary || 'No analysis recorded'
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* Author + actions */}
      {(() => {
        const drafter = resolution.drafter_panelist_id ? panelistMap.get(resolution.drafter_panelist_id) : null;
        return (
          <div className="flex items-center justify-between mb-6">
            {drafter ? (
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: drafter.avatar_color || '#6366f1' }}
                >
                  {drafter.display_name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Authored by</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{drafter.display_name}</div>
                </div>
              </div>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button
                onClick={handleContinueDraft}
                disabled={continuing}
                className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {continuing ? 'Completing...' : 'Complete Document'}
              </button>
              <button
                onClick={downloadMarkdown}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: 'var(--sidebar-bg)',
                  color: 'var(--sidebar-text)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                Download .md
              </button>
              <button
                onClick={downloadPdf}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: 'var(--text-secondary)',
                  color: 'var(--text-inverse)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                Download PDF
              </button>
              <a
                href={`/new?chain_from=${sessionId}`}
                className="btn-secondary px-4 py-2 text-sm font-semibold"
              >
                Chain &rarr; New Session
              </a>
            </div>
          </div>
        );
      })()}

      {/* Resolution document */}
      <div
        className="p-8 md:py-16 md:px-12"
        style={{
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div
          id="resolution-prose"
          className="mx-auto prose prose-gray dark:prose-invert prose-headings:font-bold prose-h1:text-2xl prose-h1:pb-3 prose-h1:mb-6 prose-h2:text-xl prose-h2:mt-8 prose-h3:text-lg prose-p:text-[15px] prose-p:leading-7 prose-li:text-[15px] prose-li:leading-7 prose-code:text-sm prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:text-xs prose-a:text-[var(--accent)] prose-table:text-sm"
          style={{ maxWidth: '70ch', color: 'var(--text-secondary)' }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {resolutionContent + (continuationText ? '\n' + continuationText : '')}
          </ReactMarkdown>
          {continuing && <span className="inline-block w-2 h-5 rounded-sm animate-pulse" style={{ background: 'var(--accent)' }} />}
        </div>
      </div>
    </div>
  );
}

function getRawAnalyses(rounds: RoundGroup[]): Map<string, string> {
  const analyses = new Map<string, string>();
  const analysisRounds = rounds.filter((r) => r.phase === 'analysis');

  for (const round of analysisRounds) {
    for (const contrib of round.contributions) {
      if (contrib.content) {
        analyses.set(contrib.panelistId, contrib.content);
      }
    }
  }

  return analyses;
}

function getVotes(rounds: RoundGroup[], panelistMap: Map<string, DbPanelist>): Map<string, VoteData> {
  const votes = new Map<string, VoteData>();
  const votingRounds = rounds.filter((r) => r.phase === 'voting');
  const lastRound = votingRounds[votingRounds.length - 1];

  if (!lastRound) return votes;

  for (const contrib of lastRound.contributions) {
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
