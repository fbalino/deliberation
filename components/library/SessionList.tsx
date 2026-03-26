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
    panelists: { count: number }[];
  }>;
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No sessions yet</p>
        <p className="mt-1">Create your first deliberation session to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map((session) => (
        <SessionCard key={session.id} {...session} />
      ))}
    </div>
  );
}
