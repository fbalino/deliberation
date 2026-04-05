'use client';

import { useEffect, useReducer, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/Badge';
import { PhaseIndicator, PHASES } from '@/components/session/PhaseIndicator';
import { ContributionFeed, type RoundGroup, type ContributionItem } from '@/components/session/ContributionFeed';
import { InterventionBar } from '@/components/session/InterventionBar';
import { VoteSummary } from '@/components/session/VoteSummary';
import { PhaseTransition } from '@/components/session/PhaseTransition';
import { ResolutionPanel } from '@/components/session/ResolutionPanel';
import { DraftView } from '@/components/session/DraftView';
import type { SessionStatus, Phase, SSEEvent, VoteVerdict, SessionDetail, DbPanelist, DbResolution } from '@/lib/supabase/types';

interface SessionState {
  phase: SessionStatus;
  currentRound: number;
  rounds: RoundGroup[];
  activeContributions: Map<string, { content: string; thinking: string; isStreaming: boolean; isThinkingStreaming: boolean }>;
  votes: Array<{ panelistId: string; panelistName: string; panelistColor: string; verdict: VoteVerdict; reasoning: string; amendments?: string | null }>;
  totalCostCents: number;
  electedDrafter: string | null;
  isPaused: boolean;
  messages: string[];
  resolutionId: string | null;
  resolution: DbResolution | null;
  userRole: 'observer' | 'participant';
}

type Action = SSEEvent | { type: 'init'; session: SessionDetail };

function createContribId(panelistId: string, phase: string, round: number) {
  return `${panelistId}-${phase}-${round}`;
}

function reducer(state: SessionState, action: Action): SessionState {
  if (action.type === 'init') {
    const session = action.session;
    const panelists = new Map(session.panelists.map((p) => [p.id, p]));
    const rounds: RoundGroup[] = [];

    for (const round of session.rounds) {
      const contributions: ContributionItem[] = (round.contributions || []).map((c) => {
        const p = panelists.get(c.panelist_id);
        return {
          id: createContribId(c.panelist_id, round.phase, round.round_number),
          panelistId: c.panelist_id,
          panelistName: p?.display_name || 'Unknown',
          panelistColor: p?.avatar_color || '#6366f1',
          modelId: p?.model_id || '',
          content: c.content,
          thinkingContent: c.thinking_content || '',
          isStreaming: false,
          isThinkingStreaming: false,
        };
      });
      rounds.push({ phase: round.phase as Phase, roundNumber: round.round_number, contributions });
    }

    const votes = session.rounds
      .filter((r) => r.phase === 'voting')
      .flatMap((r) =>
        (r.contributions || []).filter((c) => c.vote_data).map((c) => {
          const p = panelists.get(c.panelist_id);
          const vd = c.vote_data as { verdict: VoteVerdict; reasoning: string; amendments?: string | null };
          return { panelistId: c.panelist_id, panelistName: p?.display_name || 'Unknown', panelistColor: p?.avatar_color || '#6366f1', verdict: vd.verdict, reasoning: vd.reasoning, amendments: vd.amendments };
        })
      );

    const maxRound = Math.max(0, ...rounds.filter(r => r.phase === 'discussion').map(r => r.roundNumber));

    const approvedRes = session.resolutions?.find((r) => r.status === 'approved') || session.resolutions?.[0] || null;
    const sessionConfig = session.config as { user_role?: string } | undefined;
    return { ...state, phase: session.status, rounds, votes, totalCostCents: session.total_cost_cents, resolutionId: approvedRes?.id || null, resolution: approvedRes as DbResolution | null, currentRound: maxRound, userRole: (sessionConfig?.user_role as 'observer' | 'participant') || 'observer' };
  }

  switch (action.type) {
    case 'phase_change':
      return { ...state, phase: action.phase };

    case 'round_start': {
      const existing = state.rounds.find((r) => r.phase === action.phase && r.roundNumber === action.round);
      if (existing) return state;
      const newRound = action.phase === 'discussion' ? action.round : state.currentRound;
      return { ...state, rounds: [...state.rounds, { phase: action.phase, roundNumber: action.round, contributions: [] }], currentRound: newRound };
    }

    case 'contribution_start': {
      const newActive = new Map(state.activeContributions);
      newActive.set(action.panelistId, { content: '', thinking: '', isStreaming: true, isThinkingStreaming: false });
      const updatedRounds = [...state.rounds];
      const lastRound = updatedRounds[updatedRounds.length - 1];
      if (lastRound && !lastRound.contributions.find((c) => c.panelistId === action.panelistId)) {
        lastRound.contributions.push({
          id: `${action.panelistId}-live-${Date.now()}`,
          panelistId: action.panelistId,
          panelistName: action.panelistName,
          panelistColor: '#6366f1',
          modelId: '',
          content: '',
          thinkingContent: '',
          isStreaming: true,
          isThinkingStreaming: false,
        });
      }
      return { ...state, activeContributions: newActive, rounds: updatedRounds };
    }

    case 'contribution_chunk': {
      const newActive = new Map(state.activeContributions);
      const current = newActive.get(action.panelistId) || { content: '', thinking: '', isStreaming: true, isThinkingStreaming: false };
      if (action.isThinking) {
        newActive.set(action.panelistId, { ...current, thinking: current.thinking + action.text, isThinkingStreaming: true });
      } else {
        newActive.set(action.panelistId, { ...current, content: current.content + action.text, isThinkingStreaming: false });
      }
      const updatedRounds = [...state.rounds];
      const lastRound = updatedRounds[updatedRounds.length - 1];
      if (lastRound) {
        const active = newActive.get(action.panelistId)!;
        const idx = lastRound.contributions.findIndex((c) => c.panelistId === action.panelistId);
        if (idx >= 0) {
          lastRound.contributions[idx] = { ...lastRound.contributions[idx], content: active.content, thinkingContent: active.thinking, isStreaming: true, isThinkingStreaming: action.isThinking };
        }
      }
      return { ...state, activeContributions: newActive, rounds: updatedRounds };
    }

    case 'contribution_end': {
      const newActive = new Map(state.activeContributions);
      newActive.delete(action.panelistId);
      const updatedRounds = [...state.rounds];
      const lastRound = updatedRounds[updatedRounds.length - 1];
      if (lastRound) {
        const idx = lastRound.contributions.findIndex((c) => c.panelistId === action.panelistId);
        if (idx >= 0) {
          lastRound.contributions[idx] = { ...lastRound.contributions[idx], isStreaming: false, isThinkingStreaming: false };
        }
      }
      return { ...state, activeContributions: newActive, rounds: updatedRounds };
    }

    case 'vote_result':
      return { ...state, votes: [...state.votes, { panelistId: action.panelistId, panelistName: '', panelistColor: '#6366f1', verdict: action.verdict, reasoning: action.reasoning }] };

    case 'drafter_elected':
      return { ...state, electedDrafter: action.panelistId };

    case 'cost_update':
      return { ...state, totalCostCents: action.totalCostCents };

    case 'session_complete':
      return { ...state, phase: 'completed', resolutionId: action.resolutionId };

    case 'intervention_prompt':
      return { ...state, messages: [...state.messages, action.message] };

    case 'error':
      return { ...state, messages: [...state.messages, `Error: ${action.message}`], ...(action.fatal ? { phase: 'abandoned' as SessionStatus } : {}) };

    default:
      return state;
  }
}

const INITIAL_STATE: SessionState = {
  phase: 'configuring',
  currentRound: 0,
  rounds: [],
  activeContributions: new Map(),
  votes: [],
  totalCostCents: 0,
  electedDrafter: null,
  isPaused: false,
  messages: [],
  resolutionId: null,
  resolution: null,
  userRole: 'observer',
};

const PHASE_LABELS: Record<string, string> = {
  configuring: 'Configuring',
  briefing: 'Briefing',
  analyzing: 'Analysis',
  discussing: 'Discussion',
  drafter_election: 'Electing Drafter',
  drafting: 'Drafting',
  voting: 'Voting',
  completed: 'Complete',
  abandoned: 'Abandoned',
};

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [sessionTitle, setSessionTitle] = useState('');
  const [panelists, setPanelists] = useState<DbPanelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState('0:00');
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data: SessionDetail = await res.json();
        setSessionTitle(data.title || 'Untitled');
        setPanelists(data.panelists);
        dispatch({ type: 'init', session: data });
      }
      setLoading(false);
    }
    load();
  }, [sessionId]);

  useEffect(() => {
    if (loading) return;
    const isActive = !['completed', 'abandoned', 'configuring'].includes(state.phase);
    if (!isActive) return;

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (e) => {
      dispatch(JSON.parse(e.data) as SSEEvent);
    };
    es.onerror = () => {};
    return () => es.close();
  }, [sessionId, loading, state.phase]);

  useEffect(() => {
    const isActive = !['completed', 'abandoned', 'configuring'].includes(state.phase);
    if (!isActive) return;
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(`${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.phase, startTime]);

  // Auto-switch to Resolution tab when session completes
  useEffect(() => {
    if (state.phase === 'completed' && state.resolution) {
      setActiveTab('completed');
    }
  }, [state.phase, state.resolution]);

  // Fetch resolution when session_complete event arrives (if not already loaded)
  useEffect(() => {
    if (state.resolutionId && !state.resolution) {
      fetch(`/api/sessions/${sessionId}`).then(async (res) => {
        if (res.ok) {
          const data: SessionDetail = await res.json();
          const approvedRes = data.resolutions?.find((r) => r.status === 'approved') || data.resolutions?.[0];
          if (approvedRes) {
            dispatch({ type: 'init', session: data });
          }
        }
      });
    }
  }, [state.resolutionId, state.resolution, sessionId]);

  if (loading) return <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Loading session...</div>;

  const isActive = !['completed', 'abandoned', 'configuring'].includes(state.phase);
  const panelistMap = new Map(panelists.map((p) => [p.id, p as { display_name: string; avatar_color: string | null; model_id: string }]));
  const panelistIds = panelists.filter((p) => !p.is_human).map((p) => p.id);
  const totalRounds = state.rounds.filter((r) => r.phase === 'discussion').length;
  const streamingCount = state.activeContributions.size;

  // Deduplicate votes
  const deduplicatedVotes = (() => {
    const latest = new Map<string, typeof state.votes[number]>();
    for (const v of state.votes) {
      latest.set(v.panelistId, v);
    }
    return Array.from(latest.values()).map((v) => {
      const p = panelists.find((p) => p.id === v.panelistId);
      return { ...v, panelistName: p?.display_name || v.panelistName || 'Unknown', panelistColor: p?.avatar_color || v.panelistColor };
    });
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-start justify-between pb-3 mb-3 gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
        {/* Left: session info counter */}
        <div className="flex items-center gap-6">
          {/* Round counter */}
          <div
            className="flex items-center gap-3 px-4 py-2.5"
            style={{
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-text)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--sidebar-text-muted)' }}>Phase</div>
              <div className="text-sm font-semibold">{PHASE_LABELS[state.phase] || state.phase}</div>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--sidebar-border)' }} />
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--sidebar-text-muted)' }}>Round</div>
              <div className="text-sm font-semibold">{state.currentRound || '-'} / {totalRounds || '-'}</div>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--sidebar-border)' }} />
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--sidebar-text-muted)' }}>Cost</div>
              <div className="text-sm font-semibold">${(state.totalCostCents / 100).toFixed(2)}</div>
            </div>
            {isActive && (
              <>
                <div className="w-px h-8" style={{ background: 'var(--sidebar-border)' }} />
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--sidebar-text-muted)' }}>Time</div>
                  <div className="text-sm font-mono">{elapsed}</div>
                </div>
              </>
            )}
            {streamingCount > 0 && (
              <>
                <div className="w-px h-8" style={{ background: 'var(--sidebar-border)' }} />
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
                  <span className="text-xs" style={{ color: 'var(--success)' }}>{streamingCount} streaming</span>
                </div>
              </>
            )}
          </div>

          {/* Title + status + actions */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="dl-serif text-lg truncate max-w-xs" style={{ color: 'var(--text)' }}>{sessionTitle}</h2>
              <StatusBadge status={state.phase} />
              <a
                href={`/new?fork_from=${sessionId}`}
                className="text-xs transition-colors ml-2"
                style={{ color: 'var(--text-tertiary)' }}
                title="Fork this session"
              >
                Fork
              </a>
              {(state.phase === 'completed' || state.phase === 'abandoned') && (
                <button
                  onClick={() => {
                    if (!confirm('Re-run the drafting and voting phases? The same drafter will write a new complete draft.')) return;
                    const es = new EventSource(`/api/sessions/${sessionId}/redraft`);
                    es.onmessage = (e) => {
                      dispatch(JSON.parse(e.data) as SSEEvent);
                    };
                    es.onerror = () => { es.close(); };
                  }}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  Redraft
                </button>
              )}
              {isActive && (
                <button
                  onClick={async () => {
                    if (!confirm('Abandon this session? It cannot be resumed.')) return;
                    await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'abandoned' }) });
                    window.location.reload();
                  }}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--danger)' }}
                >
                  Abandon
                </button>
              )}
              {(state.phase === 'completed' || state.phase === 'abandoned') && (
                <button
                  onClick={async () => {
                    if (!confirm('Delete this session permanently? This cannot be undone.')) return;
                    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
                    router.push('/');
                  }}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--danger)' }}
                >
                  Delete
                </button>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {panelists.length} panelists
            </div>
          </div>
        </div>

        {/* Right: clickable phase tabs */}
        <PhaseIndicator
          currentPhase={state.phase}
          activeTab={activeTab}
          onTabClick={(key) => setActiveTab(activeTab === key ? null : key)}
        />
      </div>

      {/* Messages */}
      {state.messages.length > 0 && (
        <div className="mb-2 space-y-1">
          {state.messages.slice(-2).map((msg, i) => (
            <div
              key={i}
              className="text-xs px-3 py-1.5"
              style={{
                color: 'var(--warning-text)',
                background: 'var(--warning-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* Phase transition spinner */}
      <PhaseTransition phase={state.phase} isTransitioning={isActive && streamingCount === 0 && state.rounds.length > 0} />

      {/* Vote Summary — only show inline when no tab is selected and session is done */}
      {state.votes.length > 0 && !activeTab && state.phase === 'completed' && (
        <div className="mb-3">
          <VoteSummary votes={deduplicatedVotes} />
        </div>
      )}

      {/* Main content */}
      {activeTab === 'completed' ? (
        <ResolutionPanel
          resolution={state.resolution}
          panelists={panelists}
          rounds={state.rounds}
          sessionId={sessionId}
        />
      ) : activeTab === 'voting' && deduplicatedVotes.length > 0 ? (
        <div className="flex-1 overflow-y-auto py-4">
          <div className="max-w-2xl mx-auto">
            <VoteSummary votes={deduplicatedVotes} />
          </div>
        </div>
      ) : (
        <ContributionFeed
          rounds={state.rounds}
          panelistIds={panelistIds}
          panelistMap={panelistMap}
          filterPhases={activeTab ? [...(PHASES.find(p => p.key === activeTab)?.filterPhases ?? [])] : undefined}
          electedDrafter={state.electedDrafter ? (() => {
            const p = panelists.find((p) => p.id === state.electedDrafter);
            return p ? { id: p.id, name: p.display_name, color: p.avatar_color || '#6366f1' } : null;
          })() : null}
        />
      )}

      {/* Intervention Bar */}
      <InterventionBar sessionId={sessionId} isPaused={state.isPaused} isActive={isActive} userRole={state.userRole} currentPhase={state.phase} />
    </div>
  );
}
