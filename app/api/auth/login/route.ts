import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  constantTimeStringEqual,
  createAuthCookieValue,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const expectedPassword = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!expectedPassword || !secret) {
    return NextResponse.json({ error: 'auth not configured' }, { status: 500 });
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const submitted = typeof body.password === 'string' ? body.password : '';
  if (!constantTimeStringEqual(submitted, expectedPassword)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const value = await createAuthCookieValue(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
