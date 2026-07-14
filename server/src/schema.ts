// SQLite DDL, applied on boot (idempotent via IF NOT EXISTS).
// Kept as a TS string so `tsc` builds need no asset-copy step.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 24),
  password_hash TEXT NOT NULL,
  photo BLOB,
  photo_mime TEXT,
  photo_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  country TEXT NOT NULL CHECK (length(country) BETWEEN 1 AND 60),
  description TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  is_curated INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  art_key TEXT,
  category TEXT NOT NULL DEFAULT 'landmark' CHECK (category IN ('landmark', 'city', 'us-state')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (is_curated = (created_by IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_places_owner ON places(created_by);

CREATE TABLE IF NOT EXISTS stamps (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  collected_lat REAL,
  collected_lng REAL,
  distance_m REAL,
  photo BLOB,
  photo_mime TEXT,
  photo_updated_at TEXT,
  UNIQUE (user_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_stamps_user ON stamps(user_id);
`;
