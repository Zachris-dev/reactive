-- Character storage alpha: placeholder sheet tokens, multi-owner assignments and notes.
-- Independent character IDs and user IDs; never infer permissions from names.
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  character_sheet_tokens TEXT NOT NULL DEFAULT '{}',
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);

CREATE TABLE IF NOT EXISTS character_players (
  character_id TEXT NOT NULL REFERENCES characters(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(character_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_character_players_user ON character_players(user_id);

CREATE TABLE IF NOT EXISTS character_notes (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  visibility TEXT NOT NULL CHECK(visibility IN ('private','shared')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX IF NOT EXISTS idx_character_notes_character ON character_notes(character_id);
