const MAX_CHARS_PER_URL = 10000;

export async function fetchUrlContent(url: string): Promise<{ title: string; text: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Deliberation/1.0 (URL content fetcher)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const html = await response.text();

  if (contentType.includes('text/plain')) {
    return { title: url, text: html.slice(0, MAX_CHARS_PER_URL) };
  }

  // Strip HTML to plain text
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || url;

  let text = html
    // Remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    // Convert block elements to newlines
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  text = text.slice(0, MAX_CHARS_PER_URL);

  return { title, text };
}
