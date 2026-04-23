'use client';

import { SessionCard } from './SessionCard';

interface SessionListProps {
  sessions: Array<{
    id: string;
    title: string | null;
    status: string;
    tags: string[] | null;
    total_cost_cents: number;
    created_at: string;
    panelist_count?: number;
    panelists?: { count: number }[];
    chain_parent_id?: string | null;
  }>;
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-inset)' }}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ color: 'var(--text-tertiary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
          </svg>
        </div>
        <p className="text-base dl-serif" style={{ color: 'var(--text-secondary)' }}>No sessions yet</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>Create your first deliberation session to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {sessions.map((session) => (
        <SessionCard key={session.id} {...session} />
      ))}
    </div>
  );
}
