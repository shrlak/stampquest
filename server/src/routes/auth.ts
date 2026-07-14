import { Router } from 'express';
import { db, type UserRow } from '../db.js';
import {
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  requireAuth,
  verifyPassword,
} from '../auth.js';

export const authRouter = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.created_at,
    photoUrl: user.photo_updated_at
      ? `/api/auth/me/photo?v=${encodeURIComponent(user.photo_updated_at)}`
      : null,
  };
}

function statsFor(userId: number) {
  const { stampCount } = db
    .prepare('SELECT count(*) AS stampCount FROM stamps WHERE user_id = ?')
    .get(userId) as { stampCount: number };
  const { countryCount } = db
    .prepare(
      `SELECT count(DISTINCT p.country) AS countryCount
       FROM stamps s JOIN places p ON p.id = s.place_id
       WHERE s.user_id = ?`,
    )
    .get(userId) as { countryCount: number };
  return { stampCount, countryCount };
}

authRouter.post('/register', (req, res) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'INVALID_USERNAME' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    res.status(409).json({ error: 'USERNAME_TAKEN' });
    return;
  }
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password));
  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(info.lastInsertRowid) as UserRow;
  createSession(res, user.id);
  res.status(201).json({ user: serializeUser(user), stats: statsFor(user.id) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'INVALID_REQUEST' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | UserRow
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    return;
  }
  createSession(res, user.id);
  res.json({ user: serializeUser(user), stats: statsFor(user.id) });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  const user = currentUser(res);
  res.json({ user: serializeUser(user), stats: statsFor(user.id) });
});

// The user's own profile picture — shown on the top-right avatar and profile tab.
authRouter.put('/me/photo', requireAuth, (req, res) => {
  const user = currentUser(res);
  const { photo } = (req.body ?? {}) as Record<string, unknown>;
  const match = typeof photo === 'string' && photo.match(PHOTO_DATA_URL);
  if (!match) {
    res.status(400).json({ error: 'INVALID_PHOTO' });
    return;
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 4 * 1024 * 1024) {
    res.status(413).json({ error: 'PHOTO_TOO_LARGE' });
    return;
  }
  db.prepare(
    `UPDATE users SET photo = ?, photo_mime = ?, photo_updated_at = datetime('now') WHERE id = ?`,
  ).run(buffer, `image/${match[1]}`, user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
  res.json({ user: serializeUser(updated) });
});

authRouter.get('/me/photo', requireAuth, (_req, res) => {
  const user = currentUser(res);
  const row = db
    .prepare('SELECT photo, photo_mime FROM users WHERE id = ?')
    .get(user.id) as { photo: Buffer | null; photo_mime: string | null };
  if (!row.photo || !row.photo_mime) {
    res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
    return;
  }
  res.setHeader('Content-Type', row.photo_mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(row.photo);
});
