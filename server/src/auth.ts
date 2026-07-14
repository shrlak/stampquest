import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, type UserRow } from './db.js';

const SESSION_COOKIE = 'sq_session';
const SESSION_TTL_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createSession(res: Response, userId: number): void {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt,
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure cookies only in production (behind HTTPS); localhost dev/e2e stays plain HTTP.
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_DAYS * 86400_000,
    path: '/',
  });
}

export function destroySession(req: Request, res: Response): void {
  const token = readSessionToken(req);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function userFromRequest(req: Request): UserRow | null {
  const token = readSessionToken(req);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(token) as UserRow | undefined;
  return row ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'UNAUTHENTICATED' });
    return;
  }
  res.locals.user = user;
  next();
}

export function currentUser(res: Response): UserRow {
  return res.locals.user as UserRow;
}
