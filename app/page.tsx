'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { SessionList } from '@/components/library/SessionList';

type SessionSummary = {
  id: string;
  title: string | null;
  status: string;
  tags: string[] | null;
  total_cost_cents: number;
  created_at: string;
  panelist_count?: number;
  panelists?: { count: number }[];
  chain_parent_id: string | null;
};

const STATUS_FILTERS = ['all', 'analyzing', 'discussing', 'drafting', 'voting', 'completed', 'abandoned'] as const;

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/sessions?${params}`);
      if (res.ok) {
        setSessions(await res.json());
      }
      setLoading(false);
    }

    const timeout = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [search, statusFilter]);

  const totalSpend = sessions.reduce((sum, s) => sum + s.total_cost_cents, 0);
  const activeCount = sessions.filter((s) => !['completed', 'abandoned', 'configuring'].includes(s.status)).length;
  const reviewCount = sessions.filter((s) => s.status === 'voting' || s.status === 'completed').length;
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const latestSession = sessions[0];

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <div className="flex flex-col gap-5 min-[1800px]:flex-row min-[1800px]:items-end min-[1800px]:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>Command center</p>
          <h2 className="dl-serif mt-2 text-4xl tracking-tight md:text-5xl" style={{ color: 'var(--text)' }}>
            Your deliberations at a glance.
          </h2>
          <p className="mt-3 text-sm leading-6 md:text-base" style={{ color: 'var(--text-secondary)' }}>
            Start a new panel, jump back into active debates, or review finished resolutions.
          </p>
        </div>
        <Link href="/new">
          <Button size="lg">New Session</Button>
        </Link>
      </div>

      <div className="grid gap-4 min-[1800px]:grid-cols-[1fr_360px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Active" value={String(activeCount)} color="var(--info)" />
          <Metric label="Needs review" value={String(reviewCount)} color="var(--warning)" />
          <Metric label="Completed" value={String(completedCount)} color="var(--success)" />
          <Metric label="Total spend" value={`$${(totalSpend / 100).toFixed(2)}`} color="var(--accent)" />
        </div>

        <div
          className="rounded-lg p-5"
          style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', border: '1px solid var(--sidebar-border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--sidebar-active)' }}>Recommended next</p>
          <h3 className="dl-serif mt-2 text-2xl">{latestSession?.title || 'Create your first session'}</h3>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--sidebar-text-muted)' }}>
            {latestSession ? actionForStatus(latestSession.status) : 'Set up a panel, add a briefing, and launch a guided deliberation.'}
          </p>
          <Link href={latestSession ? `/session/${latestSession.id}` : '/new'}>
            <button className="mt-4 rounded-md px-4 py-2 text-sm font-bold" style={{ background: 'var(--sidebar-active)', color: '#1C1917' }}>
              {latestSession ? 'Open session' : 'Start session'}
            </button>
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div
        className="rounded-lg p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2.5 text-sm transition-colors duration-150"
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface-inset)',
              color: 'var(--text)',
            }}
          />
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-150"
                style={{
                  background: statusFilter === status ? 'var(--accent-subtle)' : 'var(--surface-inset)',
                  color: statusFilter === status ? 'var(--accent-text)' : 'var(--text-tertiary)',
                  border: statusFilter === status ? '1px solid var(--accent-muted)' : '1px solid transparent',
                }}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Session List */}
      {loading ? (
        <div className="text-center py-16">
          <div
            className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading sessions...</p>
        </div>
      ) : (
        <SessionList sessions={sessions} />
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="mt-4 text-3xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function actionForStatus(status: string) {
  if (status === 'voting') return 'Votes are ready to review before the final resolution is accepted.';
  if (status === 'drafting') return 'A selected deliberator is drafting the resolution.';
  if (status === 'discussing') return 'The panel is actively debating the briefing.';
  if (status === 'analyzing') return 'Deliberators are independently analyzing the briefing.';
  if (status === 'completed') return 'A resolution is ready to read, download, or use as a follow-up.';
  return 'This session is ready for your next action.';
}
