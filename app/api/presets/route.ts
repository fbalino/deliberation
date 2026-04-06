import { NextRequest, NextResponse } from 'next/server';
import { listPresets, insertPreset } from '@/lib/db/queries';

// GET: List all presets
export async function GET() {
  try {
    const data = await listPresets();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}

// POST: Save a new preset
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name || !body.config) {
    return NextResponse.json({ error: 'name and config are required' }, { status: 400 });
  }

  try {
    const data = await insertPreset(body.name, body.config);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
