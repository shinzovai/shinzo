
import type { NextRequest } from 'next/server';
import { sessionUser, db, sha } from './db';

export const COOKIE = 'shinzo_session';
export const DEVICE_COOKIE = 'shinzo_device';

export function userFrom(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  const user = sessionUser(token);

  if (!user) return undefined;

  // Admin can access from unlimited devices.
  if (user.role === 'admin') return user;

  // Editor must use a registered, non-revoked device.
  const deviceToken = request.cookies.get(DEVICE_COOKIE)?.value;

  if (!deviceToken || !/^[a-f0-9]{64}$/.test(deviceToken)) {
    return undefined;
  }

  const registeredDevice = db().prepare(`
    SELECT id
    FROM editor_devices
    WHERE user_id = ?
      AND device_hash = ?
      AND revoked = 0
  `).get(user.id, sha(deviceToken));

  if (!registeredDevice) return undefined;

  return user;
}

export function adminFrom(request: NextRequest) {
  const user = userFrom(request);
  return user?.role === 'admin' ? user : undefined;
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}
