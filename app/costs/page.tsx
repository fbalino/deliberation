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

interface CostAnalytics {
  byModel: Record<string, { total: number; calls: number }>;
  byPhase: Record<string, number>;
  averageCostPerSession: number;
  totalSessions: number;
  totalCost: number;
}

export default function CostDashboardPage() {
  const [sessions, setSessions] = useState<SessionCostRow[]>([]);
  const [analytics, setAnalytics] = useState<CostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [sessionsRes, analyticsRes] = await Promise.all([
        fetch('/api/sessions'),
        fetch('/api/costs'),
      ]);
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.map((s: Record<string, unknown>) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          total_cost_cents: s.total_cost_cents as number,
          created_at: s.created_at as string,
        })));
      }
      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      </div>
    );
  }

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
      <h2 className="dl-serif text-3xl mb-8" style={{ color: 'var(--text)' }}>Cost Dashboard</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>All Time</p>
          <p className="dl-serif text-2xl mt-1" style={{ color: 'var(--text)' }}>${(totalAllTime / 100).toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Last 30 Days</p>
          <p className="dl-serif text-2xl mt-1" style={{ color: 'var(--text)' }}>${(total30d / 100).toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Last 7 Days</p>
          <p className="dl-serif text-2xl mt-1" style={{ color: 'var(--text)' }}>${(total7d / 100).toFixed(2)}</p>
        </Card>
      </div>

      {/* Average & Sessions stats */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Avg Cost / Session</p>
            <p className="dl-serif text-2xl mt-1" style={{ color: 'var(--text)' }}>${(analytics.averageCostPerSession / 100).toFixed(2)}</p>
          </Card>
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Total Sessions</p>
            <p className="dl-serif text-2xl mt-1" style={{ color: 'var(--text)' }}>{analytics.totalSessions}</p>
          </Card>
        </div>
      )}

      {/* Spend by Model */}
      {analytics && Object.keys(analytics.byModel).length > 0 && (
        <Card className="mb-8">
          <h3 className="font-medium mb-4" style={{ color: 'var(--text)' }}>Spend by Model</h3>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Model</th>
                <th className="text-right py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Calls</th>
                <th className="text-right py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Total Cost</th>
                <th className="text-right py-2 font-medium" style={{ color: 'var(--text-tertiary)' }}>Avg / Call</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(analytics.byModel)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([modelId, data]) => (
                  <tr key={modelId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2 font-mono text-xs" style={{ color: 'var(--text)' }}>{modelId}</td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-tertiary)' }}>{data.calls}</td>
                    <td className="py-2 text-right font-mono" style={{ color: 'var(--text)' }}>${(data.total / 100).toFixed(2)}</td>
                    <td className="py-2 text-right font-mono" style={{ color: 'var(--text-tertiary)' }}>${(data.total / data.calls / 100).toFixed(3)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Spend by Phase */}
      {analytics && Object.keys(analytics.byPhase).length > 0 && (
        <Card className="mb-8">
          <h3 className="font-medium mb-4" style={{ color: 'var(--text)' }}>Spend by Phase</h3>
          <div className="space-y-2">
            {Object.entries(analytics.byPhase)
              .sort(([, a], [, b]) => b - a)
              .map(([phase, cost]) => {
                const pct = analytics.totalCost > 0 ? (cost / analytics.totalCost) * 100 : 0;
                return (
                  <div key={phase} className="flex items-center gap-3">
                    <span className="text-sm w-28 capitalize" style={{ color: 'var(--text-secondary)' }}>{phase}</span>
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'var(--surface-inset)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="text-sm font-mono w-20 text-right" style={{ color: 'var(--text)' }}>${(cost / 100).toFixed(2)}</span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Session Cost Table */}
      <Card padding={false}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text)' }}>Session Costs</h3>
        </div>
        {sortedSessions.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>No sessions yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left py-3 px-6 font-medium" style={{ color: 'var(--text-tertiary)' }}>Session</th>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>Status</th>
                <th className="text-right py-3 px-6 font-medium" style={{ color: 'var(--text-tertiary)' }}>Cost</th>
                <th className="text-right py-3 px-6 font-medium" style={{ color: 'var(--text-tertiary)' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((s) => (
                <tr key={s.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-3 px-6">
                    <Link href={`/session/${s.id}`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                      {s.title || 'Untitled'}
                    </Link>
                  </td>
                  <td className="py-3 px-4 capitalize" style={{ color: 'var(--text-tertiary)' }}>{s.status}</td>
                  <td className="py-3 px-6 text-right font-mono" style={{ color: 'var(--text)' }}>
                    ${(s.total_cost_cents / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-6 text-right" style={{ color: 'var(--text-tertiary)' }}>
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
