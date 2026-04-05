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
  panelists: { count: number }[];
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="dl-serif text-3xl" style={{ color: 'var(--text)' }}>Library</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} &middot; ${(totalSpend / 100).toFixed(2)} total
          </p>
        </div>
        <Link href="/new">
          <Button>New Session</Button>
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 text-sm transition-colors duration-150"
          style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
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
