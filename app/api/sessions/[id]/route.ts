import { NextRequest, NextResponse } from 'next/server';
import { getSessionDetail, getSession, updateSessionStatus, deleteSession } from '@/lib/db/queries';

// GET: Session detail with all related data
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const detail = await getSessionDetail(sessionId);

    if (!detail) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

// PATCH: Abandon a session
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();

    if (body.status !== 'abandoned') {
      return NextResponse.json({ error: 'Only status: "abandoned" is supported' }, { status: 400 });
    }

    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed' || session.status === 'abandoned') {
      return NextResponse.json({ error: 'Session is already finished' }, { status: 400 });
    }

    await updateSessionStatus(sessionId, 'abandoned');

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

// DELETE: Remove a session permanently
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'completed' && session.status !== 'abandoned' && session.status !== 'configuring') {
      // Force-abandon running sessions before deleting
      await updateSessionStatus(sessionId, 'abandoned');
    }

    await deleteSession(sessionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
