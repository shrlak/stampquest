// SQLite DDL, applied on boot (idempotent via IF NOT EXISTS).
// Kept as a TS string so `tsc` builds need no asset-copy step.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
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
