export async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === 'application/pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text || `[PDF: ${fileName} — no extractable text]`;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || `[DOCX: ${fileName} — no extractable text]`;
  }

  if (
    mimeType.startsWith('text/') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv')
  ) {
    return buffer.toString('utf-8');
  }

  if (mimeType.startsWith('image/')) {
    return `[Image: ${fileName}]`;
  }

  return `[File: ${fileName} — unsupported type: ${mimeType}]`;
}
