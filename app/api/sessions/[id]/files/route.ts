import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/db/client';
import { getSession, insertSessionFile, updateSessionBriefing } from '@/lib/db/queries';
import { extractText } from '@/lib/files/extractor';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify session exists
    const session = await getSession(sessionId);

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

    // Extract text from file
    let extractedText = '';
    try {
      extractedText = await extractText(buffer, fileType, fileName);
    } catch (err) {
      extractedText = `[Failed to extract text from ${fileName}: ${err instanceof Error ? err.message : 'unknown error'}]`;
    }

    // Insert file record and update briefing in a transaction
    await transaction(async (tx) => {
      await insertSessionFile(
        {
          session_id: sessionId,
          file_name: fileName,
          file_type: fileType,
          extracted_text: extractedText,
        },
        tx
      );

      const separator = `\n\n--- Content from file: ${fileName} ---\n`;
      await updateSessionBriefing(
        sessionId,
        (session.briefing_text || '') + separator + extractedText,
        tx
      );
    });

    return NextResponse.json({ fileName, extractedText: extractedText.slice(0, 200) + '...' });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
