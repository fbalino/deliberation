'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';

interface SessionCostRow {
  id: string;
  title: string | null;
  status: string;
  total_cost_cents: number;
  created_at: string;
}

export default function CostDashboardPage() {
  const [sessions, setSessions] = useState<SessionCostRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.map((s: Record<string, unknown>) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          total_cost_cents: s.total_cost_cents as number,
          created_at: s.created_at as string,
        })));
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const totalAllTime = sessions.reduce((s, r) => s + r.total_cost_cents, 0);
  const now = Date.now();
  const total30d = sessions
    .filter((s) => now - new Date(s.created_at).getTime() < 30 * 86400000)
    .reduce((s, r) => s + r.total_cost_cents, 0);
  const total7d = sessions
    .filter((s) => now - new Date(s.created_at).getTime() < 7 * 86400000)
    .reduce((s, r) => s + r.total_cost_cents, 0);

  const sortedSessions = [...sessions].sort((a, b) => b.total_cost_cents - a.total_cost_cents);

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Cost Dashboard</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <p className="text-sm text-gray-500">All Time</p>
          <p className="text-2xl font-bold mt-1">${(totalAllTime / 100).toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Last 30 Days</p>
          <p className="text-2xl font-bold mt-1">${(total30d / 100).toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Last 7 Days</p>
          <p className="text-2xl font-bold mt-1">${(total7d / 100).toFixed(2)}</p>
        </Card>
      </div>

      {/* Session Cost Table */}
      <Card padding={false}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-medium">Session Costs</h3>
        </div>
        {sortedSessions.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No sessions yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-6 font-medium text-gray-500">Session</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-right py-3 px-6 font-medium text-gray-500">Cost</th>
                <th className="text-right py-3 px-6 font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-6">
                    <Link href={`/session/${s.id}`} className="text-indigo-600 hover:underline">
                      {s.title || 'Untitled'}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-gray-500 capitalize">{s.status}</td>
                  <td className="py-3 px-6 text-right font-mono">
                    ${(s.total_cost_cents / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-6 text-right text-gray-500">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
