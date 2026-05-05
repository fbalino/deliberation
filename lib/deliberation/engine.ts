import {
  getSession, listPanelists, updateSessionStatus as dbUpdateSessionStatus,
  getNewInterventions, markResolutionApproved,
  tryAcquireEngineLock, setEngineHeartbeat, setEnginePaused, setEngineIdle,
} from '@/lib/db/queries';
import type { DbPanelist, DbSession, SessionConfig, SessionStatus, SSEEvent } from '@/lib/db/types';
import { BudgetExceededError, checkCostCap } from '@/lib/costs/tracker';
import { CallTimeoutError } from '@/lib/openrouter/fetch-helper';
import { runAnalysisPhase } from './phases/analysis';
import { runDiscussionPhase } from './phases/discussion';
import { runDrafterElection } from './phases/drafter-election';
import { runDraftingPhase } from './phases/drafting';
import { runVotingPhase } from './phases/voting';

const HEARTBEAT_INTERVAL_MS = 10_000;

async function loadSession(sessionId: string): Promise<DbSession> {
  const session = await getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  return session;
}

async function loadPanelists(sessionId: string): Promise<DbPanelist[]> {
  return listPanelists(sessionId);
}

async function updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
  await dbUpdateSessionStatus(sessionId, status);
}

class SessionAbandoned extends Error {
  constructor() { super('Session stopped by user'); this.name = 'SessionAbandoned'; }
}

export class EngineLockBusyError extends Error {
  constructor(sessionId: string) {
    super(`Engine already running for session ${sessionId}`);
    this.name = 'EngineLockBusyError';
  }
}

async function checkAbandoned(sessionId: string): Promise<void> {
  const current = await getSession(sessionId);
  if (current?.status === 'abandoned') throw new SessionAbandoned();
}

/**
 * Decide whether an error should pause the session (transient — user can
 * resume) or abandon it (fatal — can't safely retry).
 *
 * Conservative default: pause. A paused session preserves all spent tokens
 * and the user can decide to resume or discard. We only abandon for things
 * that mean the run is truly unsalvageable (cost cap hit, user stop).
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof CallTimeoutError) return true;
  if (err && typeof err === 'object' && 'transient' in err && (err as { transient: unknown }).transient === true) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message;
    // Provider HTTP errors carry the status code in the message
    if (/\b(408|425|429|500|502|503|504)\b/.test(msg)) return true;
    if (/(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|ENETUNREACH|EAI_AGAIN)/.test(msg)) return true;
    if (/fetch failed|network|timeout/i.test(msg)) return true;
  }
  return false;
}

export async function runDeliberation(
  sessionId: string,
  emit: (event: SSEEvent) => void
): Promise<void> {
  // ---- DB lock: at most one engine per session ----
  const acquired = await tryAcquireEngineLock(sessionId);
  if (!acquired) {
    throw new EngineLockBusyError(sessionId);
  }

  // ---- Heartbeat ticker so other instances can detect a stalled engine ----
  const heartbeat = setInterval(() => {
    void setEngineHeartbeat(sessionId).catch(() => {
      // a single failed heartbeat is fine; if many fail the lock will go stale
      // and another instance can take over
    });
  }, HEARTBEAT_INTERVAL_MS);

  const session = await loadSession(sessionId);
  const panelists = await loadPanelists(sessionId);
  const config = session.config as SessionConfig;

  // Timestamp-based intervention tracking
  let lastInterventionCheck = new Date().toISOString();

  async function checkInterventions(): Promise<{
    pause: boolean;
    forceAdvance: boolean;
    nudge: string | null;
  }> {
    const interventions = await getNewInterventions(sessionId, lastInterventionCheck);

    lastInterventionCheck = new Date().toISOString();

    let pause = false;
    let forceAdvance = false;
    let nudge: string | null = null;

    for (const intervention of interventions) {
      switch (intervention.type) {
        case 'pause':
          pause = true;
          break;
        case 'force_advance':
          forceAdvance = true;
          break;
        case 'force_approve':
          forceAdvance = true;
          break;
        case 'nudge':
          nudge = intervention.content;
          break;
      }
    }

    return { pause, forceAdvance, nudge };
  }

  async function waitForResume(): Promise<void> {
    while (true) {
      await new Promise((r) => setTimeout(r, 2000));
      const interventions = await getNewInterventions(sessionId, lastInterventionCheck);

      const hasResume = interventions.some((i) => i.type === 'resume');
      if (hasResume) {
        lastInterventionCheck = new Date().toISOString();
        return;
      }
    }
  }

  /** Skip phases whose status is already past us (set during a prior run). */
  function statusReached(target: SessionStatus): boolean {
    const order: SessionStatus[] = [
      'configuring', 'briefing', 'analyzing', 'discussing',
      'drafter_election', 'drafting', 'voting', 'completed', 'abandoned',
    ];
    return order.indexOf(session.status) > order.indexOf(target);
  }

  try {
    // Cost check before starting
    const costCheck = await checkCostCap(sessionId, config.cost_cap_cents);
    if (!costCheck.withinBudget) {
      throw new BudgetExceededError(costCheck.currentCostCents, config.cost_cap_cents);
    }

    // Phase 1: Analysis
    await checkAbandoned(sessionId);
    if (!statusReached('analyzing')) {
      await updateSessionStatus(sessionId, 'analyzing');
      emit({ type: 'phase_change', phase: 'analyzing' });
      await runAnalysisPhase(sessionId, panelists, session, config, emit);
    } else {
      emit({ type: 'phase_change', phase: 'analyzing' });
    }

    // Check interventions
    await checkAbandoned(sessionId);
    const postAnalysis = await checkInterventions();
    if (postAnalysis.forceAdvance) {
      emit({ type: 'intervention_prompt', message: 'Force advance: skipping discussion' });
    } else {
      if (postAnalysis.pause) {
        emit({ type: 'intervention_prompt', message: 'Paused after analysis' });
        await waitForResume();
      }

      // Phase 2: Discussion
      await checkAbandoned(sessionId);
      if (!statusReached('discussing')) {
        await updateSessionStatus(sessionId, 'discussing');
        emit({ type: 'phase_change', phase: 'discussing' });
        await runDiscussionPhase(sessionId, panelists, session, config, emit, checkInterventions, waitForResume);
      } else {
        emit({ type: 'phase_change', phase: 'discussing' });
      }
    }

    // Phase 3: Drafter Election
    await checkAbandoned(sessionId);
    let drafterId: string;
    if (!statusReached('drafter_election')) {
      await updateSessionStatus(sessionId, 'drafter_election');
      emit({ type: 'phase_change', phase: 'drafter_election' });
      drafterId = await runDrafterElection(sessionId, panelists, session, config, emit);
    } else {
      emit({ type: 'phase_change', phase: 'drafter_election' });
      drafterId = await runDrafterElection(sessionId, panelists, session, config, emit);
    }

    // Phase 4: Drafting
    await checkAbandoned(sessionId);
    if (!statusReached('drafting')) {
      await updateSessionStatus(sessionId, 'drafting');
    }
    emit({ type: 'phase_change', phase: 'drafting' });
    const resolutionId = await runDraftingPhase(sessionId, drafterId, panelists, session, config, emit);

    // Cost check before voting
    const costCheck4 = await checkCostCap(sessionId, config.cost_cap_cents);
    if (!costCheck4.withinBudget) {
      // Force-approve the draft and end gracefully (still 'completed', not abandoned)
      await markResolutionApproved(resolutionId);
      emit({ type: 'error', message: `Cost cap reached — draft auto-approved`, fatal: false });
      emit({ type: 'session_complete', resolutionId });
      await updateSessionStatus(sessionId, 'completed');
      return;
    }

    // Phase 5: Voting
    await checkAbandoned(sessionId);
    if (!statusReached('voting')) {
      await updateSessionStatus(sessionId, 'voting');
    }
    emit({ type: 'phase_change', phase: 'voting' });
    const finalResolutionId = await runVotingPhase(
      sessionId, resolutionId, drafterId, panelists, session, config, emit
    );

    // Update cost
    const finalCost = await checkCostCap(sessionId, config.cost_cap_cents);
    emit({ type: 'cost_update', totalCostCents: finalCost.currentCostCents });

    // Done
    await updateSessionStatus(sessionId, 'completed');
    emit({ type: 'session_complete', resolutionId: finalResolutionId });
  } catch (error) {
    if (error instanceof SessionAbandoned) {
      emit({ type: 'error', message: 'Session stopped by user', fatal: true });
      // status was already set to 'abandoned' by whoever stopped us
      return;
    }
    if (error instanceof BudgetExceededError) {
      emit({ type: 'error', message: error.message, fatal: true });
      await setEnginePaused(sessionId, error.message);
      // The cost cap is a hard fatal stop — no resume possible without raising the cap.
      await updateSessionStatus(sessionId, 'abandoned');
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown engine error';
    if (isTransientError(error)) {
      // Preserve work: pause instead of abandoning. User can click Resume.
      emit({ type: 'error', message: `Paused (transient): ${message}`, fatal: true });
      await setEnginePaused(sessionId, message);
      return;
    }

    // Truly fatal — abandon.
    emit({ type: 'error', message, fatal: true });
    await setEnginePaused(sessionId, message);
    await updateSessionStatus(sessionId, 'abandoned');
  } finally {
    clearInterval(heartbeat);
    // If we exited cleanly (no paused/abandoned set), mark engine idle.
    // setEngineIdle is safe even after setEnginePaused: paused stays paused
    // unless we explicitly resume. So only set idle on the success path.
    const finalSession = await getSession(sessionId).catch(() => null);
    if (finalSession && finalSession.engine_status === 'running') {
      await setEngineIdle(sessionId);
    }
  }
}
