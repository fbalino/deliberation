import { NextResponse } from 'next/server';
import { listCostLogs } from '@/lib/db/queries';

export async function GET() {
  try {
    const logs = await listCostLogs();

    // Aggregate by model
    const byModel: Record<string, { total: number; calls: number }> = {};
    for (const log of logs) {
      const key = log.model_id;
      if (!byModel[key]) byModel[key] = { total: 0, calls: 0 };
      byModel[key].total += log.cost_cents || 0;
      byModel[key].calls += 1;
    }

    // Aggregate by phase
    const byPhase: Record<string, number> = {};
    for (const log of logs) {
      const key = log.phase;
      byPhase[key] = (byPhase[key] || 0) + (log.cost_cents || 0);
    }

    // Average cost per session
    const sessionTotals: Record<string, number> = {};
    for (const log of logs) {
      sessionTotals[log.session_id] = (sessionTotals[log.session_id] || 0) + (log.cost_cents || 0);
    }
    const sessionCount = Object.keys(sessionTotals).length;
    const totalCost = Object.values(sessionTotals).reduce((a, b) => a + b, 0);
    const averageCostPerSession = sessionCount > 0 ? Math.round(totalCost / sessionCount) : 0;

    return NextResponse.json({
      byModel,
      byPhase,
      averageCostPerSession,
      totalSessions: sessionCount,
      totalCost,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
