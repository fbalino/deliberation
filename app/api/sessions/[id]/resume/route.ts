import { NextResponse } from 'next/server';
import { getSession, setEngineIdle } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

/**
 * POST: Resume a paused session.
 *
 * Sets engine_status back to 'idle'. The next time the client connects to
 * the SSE stream, the stream route will acquire the engine lock and run the
 * engine again. The engine + phase functions are idempotent on completed
 * work, so resume picks up roughly where the previous run stopped.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.engine_status !== 'paused') {
      return NextResponse.json(
        { error: `Session engine is '${session.engine_status}', not 'paused'` },
        { status: 400 }
      );
    }

    if (session.status === 'completed' || session.status === 'abandoned') {
      return NextResponse.json(
        { error: `Cannot resume a ${session.status} session` },
        { status: 400 }
      );
    }

    await setEngineIdle(sessionId);

    return NextResponse.json({ status: 'resumed' as const });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
