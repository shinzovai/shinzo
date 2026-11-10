import type { NextRequest } from 'next/server';
import { sessionUser } from './db';
export const COOKIE = 'shinzo_session';
export function userFrom(request: NextRequest) { return sessionUser(request.cookies.get(COOKIE)?.value); }
export function adminFrom(request: NextRequest) {
  const user = userFrom(request); return user?.role === 'admin' ? user : undefined;
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // e.g. CLI or same-origin server calls
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}
