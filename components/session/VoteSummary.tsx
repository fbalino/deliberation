'use client';

import { Badge } from '@/components/ui/Badge';
import type { VoteVerdict } from '@/lib/supabase/types';

interface VoteEntry {
  panelistId: string;
  panelistName: string;
  panelistColor: string;
  verdict: VoteVerdict;
  reasoning: string;
  amendments?: string | null;
}

interface Props {
  votes: VoteEntry[];
}

const VERDICT_CONFIG: Record<VoteVerdict, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  approve: { label: 'Approve', variant: 'success' },
  approve_with_amendments: { label: 'Approve w/ Amendments', variant: 'warning' },
  reject: { label: 'Reject', variant: 'danger' },
};

export function VoteSummary({ votes }: Props) {
  if (votes.length === 0) return null;

  const approvals = votes.filter(
    (v) => v.verdict === 'approve' || v.verdict === 'approve_with_amendments'
  ).length;

  return (
    <div className="space-y-4">
      {/* Tally */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {approvals} of {votes.length} approved
        </span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-inset)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(approvals / votes.length) * 100}%`, background: 'var(--success)' }}
          />
        </div>
      </div>

      {/* Individual votes */}
      <div className="space-y-3">
        {votes.map((vote) => {
          const config = VERDICT_CONFIG[vote.verdict];
          return (
            <div
              key={vote.panelistId}
              className="flex items-start gap-3 p-3"
              style={{
                background: 'var(--surface-inset)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: vote.panelistColor }}
              >
                {vote.panelistName.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{vote.panelistName}</span>
                  <Badge variant={config.variant}>{config.label}</Badge>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{vote.reasoning}</p>
                {vote.amendments && (
                  <p className="text-sm mt-1" style={{ color: 'var(--warning-text)' }}>
                    Amendments: {vote.amendments}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
