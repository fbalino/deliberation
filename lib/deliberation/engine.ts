import {
  getSession, listPanelists, updateSessionStatus as dbUpdateSessionStatus,
  getNewInterventions, markResolutionApproved,
} from '@/lib/db/queries';
import type { DbPanelist, DbSession, SessionConfig, SessionStatus, SSEEvent } from '@/lib/db/types';
import { checkCostCap } from '@/lib/costs/tracker';
import { runAnalysisPhase } from './phases/analysis';
import { runDiscussionPhase } from './phases/discussion';
import { runDrafterElection } from './phases/drafter-election';
import { runDraftingPhase } from './phases/drafting';
import { runVotingPhase } from './phases/voting';

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

async function checkAbandoned(sessionId: string): Promise<void> {
  const current = await getSession(sessionId);
  if (current?.status === 'abandoned') throw new SessionAbandoned();
}

export async function runDeliberation(
  sessionId: string,
  emit: (event: SSEEvent) => void
): Promise<void> {
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

  try {
    // Cost check before starting
    const costCheck = await checkCostCap(sessionId, config.cost_cap_cents);
    if (!costCheck.withinBudget) {
      emit({ type: 'error', message: 'Session cost cap already exceeded', fatal: true });
      await updateSessionStatus(sessionId, 'abandoned');
      return;
    }

    // Phase 1: Analysis
    await checkAbandoned(sessionId);
    await updateSessionStatus(sessionId, 'analyzing');
    emit({ type: 'phase_change', phase: 'analyzing' });
    await runAnalysisPhase(sessionId, panelists, session, config, emit);

    // Check interventions
    await checkAbandoned(sessionId);
    const postAnalysis = await checkInterventions();
    if (postAnalysis.forceAdvance) {
      // Skip discussion, go straight to drafting with first panelist
      emit({ type: 'intervention_prompt', message: 'Force advance: skipping discussion' });
    } else {
      if (postAnalysis.pause) {
        emit({ type: 'intervention_prompt', message: 'Paused after analysis' });
        await waitForResume();
      }

      // Cost check
      const costCheck2 = await checkCostCap(sessionId, config.cost_cap_cents);
      if (!costCheck2.withinBudget) {
        emit({ type: 'error', message: `Cost cap reached ($${(costCheck2.currentCostCents / 100).toFixed(2)})`, fatal: true });
        await updateSessionStatus(sessionId, 'abandoned');
        return;
      }

      // Phase 2: Discussion
      await checkAbandoned(sessionId);
      await updateSessionStatus(sessionId, 'discussing');
      emit({ type: 'phase_change', phase: 'discussing' });
      await runDiscussionPhase(sessionId, panelists, session, config, emit, checkInterventions, waitForResume);
    }

    // Cost check
    await checkAbandoned(sessionId);
    const costCheck3 = await checkCostCap(sessionId, config.cost_cap_cents);
    if (!costCheck3.withinBudget) {
      emit({ type: 'error', message: `Cost cap reached ($${(costCheck3.currentCostCents / 100).toFixed(2)})`, fatal: true });
      await updateSessionStatus(sessionId, 'abandoned');
      return;
    }

    // Phase 3: Drafter Election
    await checkAbandoned(sessionId);
    await updateSessionStatus(sessionId, 'drafter_election');
    emit({ type: 'phase_change', phase: 'drafter_election' });
    const drafterId = await runDrafterElection(sessionId, panelists, session, config, emit);

    // Phase 4: Drafting
    await checkAbandoned(sessionId);
    await updateSessionStatus(sessionId, 'drafting');
    emit({ type: 'phase_change', phase: 'drafting' });
    const resolutionId = await runDraftingPhase(sessionId, drafterId, panelists, session, config, emit);

    // Cost check
    const costCheck4 = await checkCostCap(sessionId, config.cost_cap_cents);
    if (!costCheck4.withinBudget) {
      // Force-approve the draft
      await markResolutionApproved(resolutionId);
      emit({ type: 'error', message: `Cost cap reached — draft auto-approved`, fatal: false });
      emit({ type: 'session_complete', resolutionId });
      await updateSessionStatus(sessionId, 'completed');
      return;
    }

    // Phase 5: Voting
    await checkAbandoned(sessionId);
    await updateSessionStatus(sessionId, 'voting');
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
      return; // Already marked abandoned — don't overwrite
    }
    const message = error instanceof Error ? error.message : 'Unknown engine error';
    emit({ type: 'error', message, fatal: true });
    await updateSessionStatus(sessionId, 'abandoned');
  }
}
