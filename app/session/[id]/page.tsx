'use client';

import { useEffect, useReducer, useState, use } from 'react';
import { StatusBadge } from '@/components/ui/Badge';
import { PhaseIndicator } from '@/components/session/PhaseIndicator';
import { ContributionFeed, type RoundGroup, type ContributionItem } from '@/components/session/ContributionFeed';
import { InterventionBar } from '@/components/session/InterventionBar';
import { VoteSummary } from '@/components/session/VoteSummary';
import type { SessionStatus, Phase, SSEEvent, VoteVerdict, SessionDetail, DbPanelist } from '@/lib/supabase/types';

interface SessionState {
  phase: SessionStatus;
  rounds: RoundGroup[];
  activeContributions: Map<string, { content: string; thinking: string; isStreaming: boolean; isThinkingStreaming: boolean }>;
  votes: Array<{ panelistId: string; panelistName: string; panelistColor: string; verdict: VoteVerdict; reasoning: string; amendments?: string | null }>;
  totalCostCents: number;
  electedDrafter: string | null;
  isPaused: boolean;
  messages: string[];
  resolutionId: string | null;
}

type Action = SSEEvent | { type: 'init'; session: SessionDetail };

function createContribId(panelistId: string, phase: string, round: number) {
  return `${panelistId}-${phase}-${round}`;
}

function reducer(state: SessionState, action: Action): SessionState {
  if (action.type === 'init') {
    // Build state from loaded session data
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

      rounds.push({
        phase: round.phase as Phase,
        roundNumber: round.round_number,
        contributions,
      });
    }

    const votes = session.rounds
      .filter((r) => r.phase === 'voting')
      .flatMap((r) =>
        (r.contributions || [])
          .filter((c) => c.vote_data)
          .map((c) => {
            const p = panelists.get(c.panelist_id);
            const vd = c.vote_data as { verdict: VoteVerdict; reasoning: string; amendments?: string | null };
            return {
              panelistId: c.panelist_id,
              panelistName: p?.display_name || 'Unknown',
              panelistColor: p?.avatar_color || '#6366f1',
              verdict: vd.verdict,
              reasoning: vd.reasoning,
              amendments: vd.amendments,
            };
          })
      );

    return {
      ...state,
      phase: session.status,
      rounds,
      votes,
      totalCostCents: session.total_cost_cents,
      resolutionId: session.resolutions?.[0]?.id || null,
    };
  }

  switch (action.type) {
    case 'phase_change':
      return { ...state, phase: action.phase };

    case 'round_start': {
      const existing = state.rounds.find(
        (r) => r.phase === action.phase && r.roundNumber === action.round
      );
      if (existing) return state;
      return {
        ...state,
        rounds: [...state.rounds, { phase: action.phase, roundNumber: action.round, contributions: [] }],
      };
    }

    case 'contribution_start': {
      const newActive = new Map(state.activeContributions);
      newActive.set(action.panelistId, { content: '', thinking: '', isStreaming: true, isThinkingStreaming: false });
      return { ...state, activeContributions: newActive };
    }

    case 'contribution_chunk': {
      const newActive = new Map(state.activeContributions);
      const current = newActive.get(action.panelistId) || { content: '', thinking: '', isStreaming: true, isThinkingStreaming: false };
      if (action.isThinking) {
        newActive.set(action.panelistId, { ...current, thinking: current.thinking + action.text, isThinkingStreaming: true });
      } else {
        newActive.set(action.panelistId, { ...current, content: current.content + action.text, isThinkingStreaming: false });
      }

      // Update the latest round's contribution for this panelist
      const updatedRounds = [...state.rounds];
      const lastRound = updatedRounds[updatedRounds.length - 1];
      if (lastRound) {
        const active = newActive.get(action.panelistId)!;
        const existingIdx = lastRound.contributions.findIndex((c) => c.panelistId === action.panelistId);
        if (existingIdx >= 0) {
          lastRound.contributions[existingIdx] = {
            ...lastRound.contributions[existingIdx],
            content: active.content,
            thinkingContent: active.thinking,
            isStreaming: true,
            isThinkingStreaming: action.isThinking,
          };
        }
      }

      return { ...state, activeContributions: newActive, rounds: updatedRounds };
    }

    case 'contribution_end': {
      const newActive = new Map(state.activeContributions);
      newActive.delete(action.panelistId);
      // Mark contribution as done in the last round
      const updatedRounds = [...state.rounds];
      const lastRound = updatedRounds[updatedRounds.length - 1];
      if (lastRound) {
        const existingIdx = lastRound.contributions.findIndex((c) => c.panelistId === action.panelistId);
        if (existingIdx >= 0) {
          lastRound.contributions[existingIdx] = {
            ...lastRound.contributions[existingIdx],
            isStreaming: false,
            isThinkingStreaming: false,
          };
        }
      }
      return { ...state, activeContributions: newActive, rounds: updatedRounds };
    }

    case 'vote_result':
      return {
        ...state,
        votes: [
          ...state.votes,
          {
            panelistId: action.panelistId,
            panelistName: '',
            panelistColor: '#6366f1',
            verdict: action.verdict,
            reasoning: action.reasoning,
          },
        ],
      };

    case 'drafter_elected':
      return { ...state, electedDrafter: action.panelistId };

    case 'cost_update':
      return { ...state, totalCostCents: action.totalCostCents };

    case 'session_complete':
      return { ...state, phase: 'completed', resolutionId: action.resolutionId };

    case 'intervention_prompt':
      return { ...state, messages: [...state.messages, action.message] };

    case 'error':
      return {
        ...state,
        messages: [...state.messages, `Error: ${action.message}`],
        ...(action.fatal ? { phase: 'abandoned' as SessionStatus } : {}),
      };

    default:
      return state;
  }
}

const INITIAL_STATE: SessionState = {
  phase: 'configuring',
  rounds: [],
  activeContributions: new Map(),
  votes: [],
  totalCostCents: 0,
  electedDrafter: null,
  isPaused: false,
  messages: [],
  resolutionId: null,
};

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [sessionTitle, setSessionTitle] = useState('');
  const [panelists, setPanelists] = useState<DbPanelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState('0:00');

  // Load session data
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

  // SSE connection for live sessions
  useEffect(() => {
    if (loading) return;
    const isActive = !['completed', 'abandoned', 'configuring'].includes(state.phase);
    if (!isActive) return;

    const panelistMap = new Map(panelists.map((p) => [p.id, p]));

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (e) => {
      const event: SSEEvent = JSON.parse(e.data);

      // For contribution_start, add a placeholder to the current round
      if (event.type === 'contribution_start') {
        const p = panelistMap.get(event.panelistId);
        dispatch({ type: 'round_start', round: 0, phase: 'analysis' }); // ensure round exists
        // Add empty contribution
        const lastRound = state.rounds[state.rounds.length - 1];
        if (lastRound && !lastRound.contributions.find((c) => c.panelistId === event.panelistId)) {
          lastRound.contributions.push({
            id: `${event.panelistId}-live`,
            panelistId: event.panelistId,
            panelistName: p?.display_name || event.panelistName,
            panelistColor: p?.avatar_color || '#6366f1',
            modelId: p?.model_id || '',
            content: '',
            thinkingContent: '',
            isStreaming: true,
            isThinkingStreaming: false,
          });
        }
      }

      dispatch(event);
    };
    es.onerror = () => {
      // EventSource auto-reconnects
    };
    return () => es.close();
  }, [sessionId, loading, state.phase, panelists, state.rounds]);

  // Elapsed time
  useEffect(() => {
    const isActive = !['completed', 'abandoned', 'configuring'].includes(state.phase);
    if (!isActive) return;

    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      setElapsed(`${mins}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.phase, startTime]);

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading session...</div>;
  }

  const isActive = !['completed', 'abandoned', 'configuring'].includes(state.phase);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{sessionTitle}</h2>
            <StatusBadge status={state.phase} />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
            <span>${(state.totalCostCents / 100).toFixed(2)}</span>
            {isActive && <span>{elapsed}</span>}
          </div>
        </div>
        <PhaseIndicator currentPhase={state.phase} />
      </div>

      {/* Messages / notifications */}
      {state.messages.length > 0 && (
        <div className="mb-4 space-y-1">
          {state.messages.slice(-3).map((msg, i) => (
            <div key={i} className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded">
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* Vote Summary (shown during/after voting) */}
      {state.votes.length > 0 && (
        <div className="mb-4">
          <VoteSummary
            votes={state.votes.map((v) => {
              const p = panelists.find((p) => p.id === v.panelistId);
              return {
                ...v,
                panelistName: p?.display_name || v.panelistName || 'Unknown',
                panelistColor: p?.avatar_color || v.panelistColor,
              };
            })}
          />
        </div>
      )}

      {/* Resolution link */}
      {state.resolutionId && state.phase === 'completed' && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <a
            href={`/session/${sessionId}/resolution`}
            className="text-green-700 font-medium hover:underline"
          >
            View Final Resolution →
          </a>
        </div>
      )}

      {/* Contribution Feed */}
      <ContributionFeed rounds={state.rounds} />

      {/* Intervention Bar */}
      <InterventionBar
        sessionId={sessionId}
        isPaused={state.isPaused}
        isActive={isActive}
      />
    </div>
  );
}
