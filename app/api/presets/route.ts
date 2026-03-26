import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// GET: List all presets
export async function GET() {
  const { data, error } = await supabaseServer
    .from('presets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST: Save a new preset
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name || !body.config) {
    return NextResponse.json({ error: 'name and config are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('presets')
    .insert({ name: body.name, config: body.config })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
