'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VoteSummary } from '@/components/session/VoteSummary';
import type { SessionDetail, VoteVerdict, DbPanelist } from '@/lib/db/types';

export default function ResolutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) setSession(await res.json());
      setLoading(false);
    }
    load();
  }, [sessionId]);

  if (loading) return <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>;
  if (!session) return <div className="text-center py-12" style={{ color: 'var(--danger)' }}>Session not found</div>;

  const resolution = session.resolutions?.find((r) => r.status === 'approved');
  const panelists = new Map<string, DbPanelist>(session.panelists.map((p) => [p.id, p]));

  // Get votes from the last voting round
  const votingRounds = session.rounds.filter((r) => r.phase === 'voting');
  const lastVotingRound = votingRounds[votingRounds.length - 1];
  const votes = (lastVotingRound?.contributions || [])
    .filter((c) => c.vote_data)
    .map((c) => {
      const p = panelists.get(c.panelist_id);
      const vd = c.vote_data as { verdict: VoteVerdict; reasoning: string; amendments?: string | null };
      return {
        panelistId: c.panelist_id,
        panelistName: p?.display_name || 'Unknown',
        panelistColor: p?.avatar_color || '#6366f1',
        verdict: vd.verdict,
        reasoning: vd.reasoning,
        amendments: vd.amendments,
      };
    });

  function downloadMarkdown() {
    if (!resolution) return;
    const blob = new Blob([resolution.content_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session!.title || 'resolution'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/session/${sessionId}`} className="text-sm hover:underline mb-1 block" style={{ color: 'var(--accent)' }}>
            &larr; Back to session
          </Link>
          <h2 className="dl-serif text-2xl" style={{ color: 'var(--text)' }}>{session.title || 'Resolution'}</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Version {resolution?.version || 1} &middot; ${(session.total_cost_cents / 100).toFixed(2)} total cost
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={downloadMarkdown}>
            Download .md
          </Button>
          <Link href={`/new?chain_from=${sessionId}`}>
            <Button variant="secondary">Chain &rarr; New Session</Button>
          </Link>
        </div>
      </div>

      {/* Vote Summary */}
      {votes.length > 0 && (
        <Card className="mb-6">
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Vote Summary</h3>
          <VoteSummary votes={votes} />
        </Card>
      )}

      {/* Resolution Content */}
      <Card>
        {resolution ? (
          <div className="prose prose-sm dark:prose-invert max-w-none" style={{ color: 'var(--text-secondary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {resolution.content_markdown}
            </ReactMarkdown>
          </div>
        ) : (
          <p style={{ color: 'var(--text-tertiary)' }}>No approved resolution found for this session.</p>
        )}
      </Card>
    </div>
  );
}
