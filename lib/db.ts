import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { DEFAULT_CONFIG } from './types';
import type { UserPublic } from './types';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

type RawUser = {
  id: number; username: string; password_hash: string; role: 'admin' | 'editor';
  active: number; quota: number; used: number; expires_at: string | null; created_at: string;
};
type SessionUser = RawUser;
let database: InstanceType<typeof DatabaseSync> | undefined;

export const dataDir = () => path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
export const db = () => {
  if (database) return database;
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(path.join(dataDir(), 'shinzo.sqlite'));
  database.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','editor')),
      active INTEGER NOT NULL DEFAULT 1, quota INTEGER NOT NULL DEFAULT 10,
      used INTEGER NOT NULL DEFAULT 0, expires_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS export_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      mark_label TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
 
  // Device security database migration.
  // Existing users and sessions are preserved.
  const userColumns = database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;

  if (!userColumns.some(column => column.name === 'device_limit')) {
    database.exec(
      'ALTER TABLE users ADD COLUMN device_limit INTEGER NOT NULL DEFAULT 1'
    );
  }

  if (!userColumns.some(column => column.name === 'blocked_reason')) {
    database.exec(
      'ALTER TABLE users ADD COLUMN blocked_reason TEXT'
    );
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS editor_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_hash TEXT NOT NULL,
      device_name TEXT,
      browser TEXT,
      ip_address TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, device_hash),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS device_login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_hash TEXT,
      browser TEXT,
      ip_address TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_editor_devices_user
      ON editor_devices(user_id);

    CREATE INDEX IF NOT EXISTS idx_device_login_logs_user
      ON device_login_logs(user_id, created_at);
  `);

  // editor accounts never receive permissions to upload/change templates.
  const existingTemplate = database.prepare("SELECT value FROM settings WHERE key='template_file'").get();
  const referenceImage = path.join(process.cwd(), 'assets', 'canadian-reference.jpg');
  if (!existingTemplate && fs.existsSync(referenceImage)) {
    const destinationName = 'shinzo-reference-template.jpg';
    fs.copyFileSync(referenceImage, path.join(dataDir(), destinationName));
    const insert = database.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
    insert.run('template_file', destinationName);
    insert.run('template_mime', 'image/jpeg');
    insert.run('template_config', JSON.stringify(DEFAULT_CONFIG));
  }
  const username = process.env.ADMIN_USERNAME || 'shinzo';
  const password = process.env.ADMIN_PASSWORD;
  if (password && password.length >= 12 && password !== 'REPLACE_WITH_YOUR_OWN_STRONG_PASSWORD') {
    const admin = database.prepare('SELECT id FROM users WHERE username = ?').get(username) as {id: number} | undefined;
    if (!admin) database.prepare(`INSERT INTO users (username,password_hash,role,active,quota,created_at)
      VALUES (?, ?, 'admin', 1, -1, ?)`)
      .run(username, bcrypt.hashSync(password, 12), new Date().toISOString());
  }
  return database;
};

export const publicUser = (user: RawUser): UserPublic => ({
  id: user.id, username: user.username, role: user.role, active: !!user.active,
  quota: user.quota, used: user.used, expiresAt: user.expires_at, createdAt: user.created_at
});
export const findUser = (username: string): RawUser | undefined => db().prepare('SELECT * FROM users WHERE username = ?').get(username) as RawUser | undefined;
export const findUserById = (id: number): RawUser | undefined => db().prepare('SELECT * FROM users WHERE id = ?').get(id) as RawUser | undefined;
export const listEditors = (): UserPublic[] => (db().prepare("SELECT * FROM users WHERE role='editor' ORDER BY id DESC").all() as RawUser[]).map(publicUser);

export const sha = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const createSession = (id: number) => {
  const token = crypto.randomBytes(32).toString('base64url');
  db().prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sha(token), id, Date.now() + 7 * 86400000);
  return token;
};
export const sessionUser = (token: string | undefined): SessionUser | undefined => {
  if (!token) return;
  const row = db().prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>?`).get(sha(token), Date.now()) as SessionUser | undefined;
  if (!row || !row.active || (row.expires_at && row.expires_at < new Date().toISOString().slice(0, 10))) return;
  return row;
};
export const removeSession = (token: string) => db().prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));
export const getSetting = (key: string) => (db().prepare('SELECT value FROM settings WHERE key=?').get(key) as {value: string} | undefined)?.value;
export const setSetting = (key: string, value: string) => db().prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
export const recordExport = (user: RawUser, label: string) => {
  const store = db();
  store.exec('BEGIN IMMEDIATE');
  try {
    const fresh = findUserById(user.id);
    if (!fresh || !fresh.active || (fresh.role === 'editor' && fresh.quota >= 0 && fresh.used >= fresh.quota)) throw new Error('Export limit reached or access disabled');
    if (fresh.role === 'editor') store.prepare('UPDATE users SET used=used+1 WHERE id=?').run(fresh.id);
    store.prepare('INSERT INTO export_logs(user_id,mark_label,created_at) VALUES (?,?,?)').run(user.id,label,new Date().toISOString());
    store.exec('COMMIT');
  } catch (e) { store.exec('ROLLBACK'); throw e; }
};
export const dashboardTotals = () => {
  const editors = db().prepare("SELECT COUNT(*) AS all_users, SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active_users FROM users WHERE role='editor'").get() as {all_users: number;active_users:number|null};
  const logs = db().prepare('SELECT COUNT(*) AS total FROM export_logs').get() as {total:number};
  return { users: editors.all_users, active: editors.active_users || 0, exports: logs.total };
};
export type { RawUser };
