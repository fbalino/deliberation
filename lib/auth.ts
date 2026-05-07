export const AUTH_COOKIE_NAME = 'dl_auth';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function createAuthCookieValue(secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(issuedAt));
  return `${issuedAt}.${toHex(sig)}`;
}

export async function verifyAuthCookieValue(
  value: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!value) return false;
  const idx = value.indexOf('.');
  if (idx < 0) return false;
  const issuedAt = value.slice(0, idx);
  const sigHex = value.slice(idx + 1);
  if (!/^\d+$/.test(issuedAt) || !/^[0-9a-f]+$/.test(sigHex)) return false;
  const ageSec = Math.floor(Date.now() / 1000) - parseInt(issuedAt, 10);
  if (ageSec < 0 || ageSec > AUTH_COOKIE_MAX_AGE) return false;
  const key = await importKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(issuedAt));
  return timingSafeEqual(toHex(expected), sigHex);
}

export function constantTimeStringEqual(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}
