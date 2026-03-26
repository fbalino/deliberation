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
  panelists: { count: number }[];
}

export function SessionCard({ id, title, status, tags, total_cost_cents, created_at, panelists }: SessionCardProps) {
  const panelistCount = panelists?.[0]?.count ?? 0;
  const cost = (total_cost_cents / 100).toFixed(2);
  const date = new Date(created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Link href={`/session/${id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-gray-900 truncate pr-2">
            {title || 'Untitled Session'}
          </h3>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{panelistCount} panelist{panelistCount !== 1 ? 's' : ''}</span>
          <span>${cost}</span>
          <span>{date}</span>
        </div>

        {tags && tags.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
