-- Track the identity that actually committed the current revision.
ALTER TABLE characters ADD COLUMN updated_by TEXT REFERENCES users(id);
ALTER TABLE character_notes ADD COLUMN updated_by TEXT REFERENCES users(id);

-- Offline synchronization foundations: immutable prior revisions and durable
-- idempotency receipts. Existing characters/notes remain at revision 1.
CREATE TABLE IF NOT EXISTS character_revisions (
 character_id TEXT NOT NULL REFERENCES characters(id),
 version INTEGER NOT NULL CHECK(version>=1),
 name TEXT NOT NULL,
 character_sheet_tokens TEXT NOT NULL,
 changed_by TEXT NOT NULL REFERENCES users(id),
 recorded_at TEXT NOT NULL,
 PRIMARY KEY(character_id,version)
);
CREATE TABLE IF NOT EXISTS note_revisions (
 note_id TEXT NOT NULL REFERENCES character_notes(id),
 version INTEGER NOT NULL CHECK(version>=1),
 body TEXT NOT NULL,
 visibility TEXT NOT NULL CHECK(visibility IN ('private','shared')),
 changed_by TEXT NOT NULL REFERENCES users(id),
 recorded_at TEXT NOT NULL,
 PRIMARY KEY(note_id,version)
);
CREATE TABLE IF NOT EXISTS sync_receipts (
 operation_id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('character.replace','note.replace')),
 resource_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=2),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_receipts_resource ON sync_receipts(kind,resource_id);
