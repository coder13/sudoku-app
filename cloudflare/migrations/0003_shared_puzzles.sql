CREATE TABLE shared_puzzles (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  definition TEXT NOT NULL
);
