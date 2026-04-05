import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { extractText } from '@/lib/files/extractor';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify session exists
    const { data: session } = await supabaseServer
      .from('sessions')
      .select('id, briefing_text')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const fileType = file.type || 'application/octet-stream';
    const storagePath = `${sessionId}/${Date.now()}-${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseServer.storage
      .from('session-files')
      .upload(storagePath, buffer, { contentType: fileType });

    if (uploadError) {
      // Storage bucket may not exist — fall back to just extracting text
      console.error('Storage upload failed:', uploadError.message);
    }

    // Extract text from file
    let extractedText = '';
    try {
      extractedText = await extractText(buffer, fileType, fileName);
    } catch (err) {
      extractedText = `[Failed to extract text from ${fileName}: ${err instanceof Error ? err.message : 'unknown error'}]`;
    }

    // Insert session_files record
    await supabaseServer.from('session_files').insert({
      session_id: sessionId,
      file_name: fileName,
      file_type: fileType,
      storage_path: storagePath,
      extracted_text: extractedText,
    });

    // Append extracted text to session briefing
    const separator = `\n\n--- Content from file: ${fileName} ---\n`;
    await supabaseServer
      .from('sessions')
      .update({ briefing_text: (session.briefing_text || '') + separator + extractedText })
      .eq('id', sessionId);

    return NextResponse.json({ fileName, extractedText: extractedText.slice(0, 200) + '...' });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
