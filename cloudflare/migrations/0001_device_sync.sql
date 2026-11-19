CREATE TABLE libraries (
  id TEXT PRIMARY KEY,
  recovery_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  library TEXT NOT NULL REFERENCES libraries(id),
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX devices_library ON devices(library);

CREATE TABLE invitations (
  ticket_hash TEXT PRIMARY KEY,
  issuer TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  library TEXT NOT NULL REFERENCES libraries(id),
  expires INTEGER NOT NULL
);
CREATE INDEX invitations_expiry ON invitations(expires);

-- A null body is a permanent tombstone. A reconnecting device can distinguish
-- a deleted puzzle from one this library has never seen.
CREATE TABLE puzzles (
  library TEXT NOT NULL REFERENCES libraries(id),
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  hash TEXT NOT NULL,
  played INTEGER NOT NULL,
  elapsed INTEGER NOT NULL,
  body TEXT,
  PRIMARY KEY (library, id),
  UNIQUE (library, sequence)
);
