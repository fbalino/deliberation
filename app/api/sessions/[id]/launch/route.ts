import { NextResponse } from 'next/server';
import { getSession, updateSessionStatus } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

// POST: Launch a deliberation session
// The actual engine execution happens when the client connects to the stream endpoint.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify session exists and is in a launchable state
    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'configuring') {
      return NextResponse.json(
        { error: `Session is already in '${session.status}' state` },
        { status: 400 }
      );
    }

    // Update status to indicate the session is ready to run
    await updateSessionStatus(sessionId, 'briefing');

    return NextResponse.json({ status: 'started' as const });
  } catch (error) {
    return NextResponse.json(
      { status: 'error' as const, message: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
