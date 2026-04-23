'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';

interface SessionCardProps {
  id: string;
  title: string | null;
  status: string;
  tags: string[] | null;
  total_cost_cents: number;
  created_at: string;
  panelist_count?: number;
  panelists?: { count: number }[];
  chain_parent_id?: string | null;
}

export function SessionCard({ id, title, status, tags, total_cost_cents, created_at, panelists, panelist_count, chain_parent_id }: SessionCardProps) {
  const panelistCount = panelist_count ?? panelists?.[0]?.count ?? 0;
  const cost = (total_cost_cents / 100).toFixed(2);
  const date = new Date(created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Link href={`/session/${id}`}>
      <Card className="session-card cursor-pointer" padding={false}>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_180px_160px] md:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold truncate pr-2" style={{ color: 'var(--text)' }}>
                {title || 'Untitled Session'}
              </h3>
              <StatusBadge status={status} />
              {chain_parent_id && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--purple-subtle)', color: 'var(--purple-text)' }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.414-5.95a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                  Chain
                </span>
              )}
            </div>
            {tags && tags.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--surface-inset)', color: 'var(--text-tertiary)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>Next action</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--accent)' }}>{actionForStatus(status)}</p>
          </div>

          <div>
            <div className="flex items-center gap-3 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              <span>{panelistCount} deliberator{panelistCount !== 1 ? 's' : ''}</span>
              <span style={{ color: 'var(--border-strong)' }}>&middot;</span>
              <span>${cost}</span>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>{date}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function actionForStatus(status: string) {
  if (status === 'voting') return 'Review votes';
  if (status === 'drafting') return 'Watch draft';
  if (status === 'discussing') return 'Watch live';
  if (status === 'analyzing') return 'Analysis running';
  if (status === 'completed') return 'Read resolution';
  if (status === 'abandoned') return 'Archived';
  return 'Continue setup';
}
