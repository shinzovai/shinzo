
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminFrom, sameOrigin } from '@/lib/auth';
import { db, findUserById, listEditors } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!sameOrigin(req) || !adminFrom(req)) {
    return NextResponse.json(
      { error: 'Admin only' },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const user = findUserById(Number(id));

  if (!user || user.role !== 'editor') {
    return NextResponse.json(
      { error: 'Editor missing' },
      { status: 404 }
    );
  }

  const b = await req.json().catch(() => ({}));

  try {
    const store = db();

    // Enable or disable editor
    if (typeof b.active === 'boolean') {
      store.prepare(
        'UPDATE users SET active = ?, blocked_reason = NULL WHERE id = ?'
      ).run(b.active ? 1 : 0, user.id);

      if (!b.active) {
        store.prepare(
          'DELETE FROM sessions WHERE user_id = ?'
        ).run(user.id);
      }
    }

    // Update PDF quota
    if (b.quota !== undefined) {
      const q = Number(b.quota);

      if (!Number.isSafeInteger(q) || q < 0 || q > 100000) {
        throw new Error('Invalid quota');
      }

      store.prepare(
        'UPDATE users SET quota = ? WHERE id = ?'
      ).run(q, user.id);
    }

    // Update expiry
    if (b.expiresAt !== undefined) {
      const date =
        b.expiresAt === null ? null : String(b.expiresAt);

      if (
        date !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        throw new Error('Invalid date');
      }

      store.prepare(
        'UPDATE users SET expires_at = ? WHERE id = ?'
      ).run(date, user.id);
    }

    // Reset password
    if (b.password !== undefined) {
      const pass = String(b.password);

      if (pass.length < 10 || pass.length > 128) {
        throw new Error(
          'Password must be 10-128 characters'
        );
      }

      store.prepare(
        'UPDATE users SET password_hash = ? WHERE id = ?'
      ).run(bcrypt.hashSync(pass, 12), user.id);

      store.prepare(
        'DELETE FROM sessions WHERE user_id = ?'
      ).run(user.id);
    }

    // Reset PDF usage
    if (b.resetUsed === true) {
      store.prepare(
        'UPDATE users SET used = 0 WHERE id = ?'
      ).run(user.id);
    }

    // Change maximum registered devices
    if (b.deviceLimit !== undefined) {
      const limit = Number(b.deviceLimit);

      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        throw new Error(
          'Device limit must be between 1 and 20'
        );
      }

      store.prepare(
        'UPDATE users SET device_limit = ? WHERE id = ?'
      ).run(limit, user.id);
    }

    // Reset registered devices
    if (b.resetDevices === true) {
      store.prepare(
        'DELETE FROM editor_devices WHERE user_id = ?'
      ).run(user.id);

      store.prepare(
        'DELETE FROM sessions WHERE user_id = ?'
      ).run(user.id);
    }

    // Unblock editor account
    if (b.unblock === true) {
      store.prepare(`
        UPDATE users
        SET active = 1,
            blocked_reason = NULL
        WHERE id = ?
      `).run(user.id);

      store.prepare(
        'DELETE FROM sessions WHERE user_id = ?'
      ).run(user.id);
    }

    return NextResponse.json({
      ok: true,
      users: listEditors()
    });

  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
